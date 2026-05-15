/*
 * pty_win.c — N-API native addon for Windows using anonymous pipes.
 *
 * ConPTY (CreatePseudoConsole) cannot route Node.js child-process stdout
 * through the output pipe when the parent is also a Node.js process — the
 * child's stdout ends up on the parent's console instead of through hOutRead.
 *
 * This implementation uses plain anonymous pipes with STARTF_USESTDHANDLES
 * instead.  The editor child's stdout is captured via the pipe, and the
 * COLUMNS / LINES environment variables (set in build_env_block) tell the
 * editor its terminal dimensions so it renders at the correct size.
 *
 * Exported functions:
 *   spawn(execPath, args[], cols, rows, cwd?) → { fd, pid }
 *   write(fd, buffer)
 *   read(fd)                                  → Buffer | null  (non-blocking)
 *   resize(fd, cols, rows)                    → no-op on Windows pipe PTY
 *   kill(pid, signal)
 *   waitpid(pid, nonblocking?)                → { exited, code }
 *   close(fd)
 *
 * "fd" is a 1-based index into a private session table (not a real fd).
 * "pid" is the Windows process ID returned by CreateProcess.
 */

#define NAPI_VERSION 6
#define WIN32_LEAN_AND_MEAN
#include <node_api.h>
#include <windows.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

/* ── Session table ────────────────────────────────────────────────────────── */

#define MAX_SESSIONS 64

typedef struct {
    BOOL   active;
    HANDLE hPipeWrite;  /* parent writes here → child's stdin */
    HANDLE hPipeRead;   /* parent reads here  ← child's stdout */
    HANDLE hProcess;
    HANDLE hThread;
    DWORD  dwPid;
} PtySession;

static PtySession g_sessions[MAX_SESSIONS];
static BOOL g_init = FALSE;

static void sessions_init(void)
{
    if (!g_init) {
        memset(g_sessions, 0, sizeof(g_sessions));
        g_init = TRUE;
    }
}

static int session_alloc(void)
{
    int i;
    for (i = 0; i < MAX_SESSIONS; i++) {
        if (!g_sessions[i].active) return i;
    }
    return -1;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

static napi_value throw_win_err(napi_env env, const char *prefix, DWORD err)
{
    char msg[512];
    char sys[256] = "";
    FormatMessageA(FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
                   NULL, err, 0, sys, sizeof(sys), NULL);
    snprintf(msg, sizeof(msg), "%s (0x%08lX): %s", prefix, (unsigned long)err, sys);
    napi_throw_error(env, NULL, msg);
    return NULL;
}

static napi_value napi_undef(napi_env env)
{
    napi_value v;
    napi_get_undefined(env, &v);
    return v;
}

/*
 * Build a Windows command line string: "exe" [arg1] [arg2] ...
 * Args that contain spaces or tabs are quoted.
 */
static WCHAR *build_wide_cmdline(const char *exe, char **args, uint32_t nargs)
{
    uint32_t i;
    int exe_wlen = MultiByteToWideChar(CP_UTF8, 0, exe, -1, NULL, 0);
    size_t total = (size_t)exe_wlen + 3;
    for (i = 0; i < nargs; i++) {
        int wl = MultiByteToWideChar(CP_UTF8, 0, args[i], -1, NULL, 0);
        total += (size_t)wl + 4;
    }
    WCHAR *cmd = (WCHAR *)malloc(total * sizeof(WCHAR));
    if (!cmd) return NULL;

    WCHAR *p = cmd;
    *p++ = L'"';
    int n = MultiByteToWideChar(CP_UTF8, 0, exe, -1, p, (int)(total - (p - cmd)));
    p += n - 1;
    *p++ = L'"';

    for (i = 0; i < nargs; i++) {
        *p++ = L' ';
        int wl = MultiByteToWideChar(CP_UTF8, 0, args[i], -1, NULL, 0);
        WCHAR *tmp = (WCHAR *)malloc((size_t)wl * sizeof(WCHAR));
        if (!tmp) { free(cmd); return NULL; }
        MultiByteToWideChar(CP_UTF8, 0, args[i], -1, tmp, wl);
        bool need_q = (wcschr(tmp, L' ') != NULL || wcschr(tmp, L'\t') != NULL);
        if (need_q) *p++ = L'"';
        memcpy(p, tmp, (size_t)(wl - 1) * sizeof(WCHAR));
        p += wl - 1;
        if (need_q) *p++ = L'"';
        free(tmp);
    }
    *p = L'\0';
    return cmd;
}

/*
 * Build a Unicode environment block for the child process.
 * Inherits the current environment, overriding COLUMNS, LINES, TERM, COLORTERM.
 */
static WCHAR *build_env_block(int32_t cols, int32_t rows)
{
    static const WCHAR * const SKIP_VARS[] = {
        L"COLUMNS=", L"LINES=", L"TERM=", L"COLORTERM="
    };
    static const int N_SKIP = 4;

    LPWCH env = GetEnvironmentStringsW();
    if (!env) return NULL;

    const WCHAR *p = env;
    size_t needed = 0;
    while (*p) {
        size_t slen = wcslen(p);
        int skip = 0, k;
        for (k = 0; k < N_SKIP; k++) {
            size_t plen = wcslen(SKIP_VARS[k]);
            if (slen >= plen && _wcsnicmp(p, SKIP_VARS[k], plen) == 0) {
                skip = 1; break;
            }
        }
        if (!skip) needed += slen + 1;
        p += slen + 1;
    }
    FreeEnvironmentStringsW(env);

    WCHAR cols_var[64], rows_var[64];
    swprintf(cols_var, 64, L"COLUMNS=%d", (int)cols);
    swprintf(rows_var, 64, L"LINES=%d",   (int)rows);
    needed += wcslen(cols_var) + 1;
    needed += wcslen(rows_var) + 1;
    needed += wcslen(L"TERM=xterm-256color") + 1;
    needed += wcslen(L"COLORTERM=truecolor") + 1;
    needed += 1;

    WCHAR *block = (WCHAR *)malloc(needed * sizeof(WCHAR));
    if (!block) return NULL;

    env = GetEnvironmentStringsW();
    if (!env) { free(block); return NULL; }

    WCHAR *q = block;
    p = env;
    while (*p) {
        size_t slen = wcslen(p);
        int skip = 0, k;
        for (k = 0; k < N_SKIP; k++) {
            size_t plen = wcslen(SKIP_VARS[k]);
            if (slen >= plen && _wcsnicmp(p, SKIP_VARS[k], plen) == 0) {
                skip = 1; break;
            }
        }
        if (!skip) { wcscpy(q, p); q += slen + 1; }
        p += slen + 1;
    }
    FreeEnvironmentStringsW(env);

    wcscpy(q, cols_var);                q += wcslen(cols_var) + 1;
    wcscpy(q, rows_var);                q += wcslen(rows_var) + 1;
    wcscpy(q, L"TERM=xterm-256color"); q += wcslen(L"TERM=xterm-256color") + 1;
    wcscpy(q, L"COLORTERM=truecolor"); q += wcslen(L"COLORTERM=truecolor") + 1;
    *q = L'\0';
    return block;
}

/* ── spawn ────────────────────────────────────────────────────────────────── */

static napi_value pty_spawn(napi_env env, napi_callback_info info)
{
    sessions_init();

    size_t argc = 5;
    napi_value argv[5];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (argc < 4) {
        napi_throw_error(env, NULL, "spawn: 4 args required");
        return NULL;
    }

    /* execPath */
    size_t exec_len = 0;
    napi_get_value_string_utf8(env, argv[0], NULL, 0, &exec_len);
    char *exec_path = (char *)malloc(exec_len + 1);
    if (!exec_path) { napi_throw_error(env, NULL, "OOM"); return NULL; }
    napi_get_value_string_utf8(env, argv[0], exec_path, exec_len + 1, NULL);

    /* args[] */
    uint32_t nargs = 0;
    napi_get_array_length(env, argv[1], &nargs);
    char **args = NULL;
    if (nargs > 0) {
        args = (char **)calloc(nargs, sizeof(char *));
        if (!args) { free(exec_path); napi_throw_error(env, NULL, "OOM"); return NULL; }
        uint32_t i;
        for (i = 0; i < nargs; i++) {
            napi_value elem;
            napi_get_element(env, argv[1], i, &elem);
            size_t alen = 0;
            napi_get_value_string_utf8(env, elem, NULL, 0, &alen);
            args[i] = (char *)malloc(alen + 1);
            if (!args[i]) {
                uint32_t j;
                for (j = 0; j < i; j++) free(args[j]);
                free(args); free(exec_path);
                napi_throw_error(env, NULL, "OOM"); return NULL;
            }
            napi_get_value_string_utf8(env, elem, args[i], alen + 1, NULL);
        }
    }

    /* cols, rows */
    int32_t cols = 80, rows = 24;
    napi_get_value_int32(env, argv[2], &cols);
    napi_get_value_int32(env, argv[3], &rows);

    /* optional cwd */
    WCHAR *wcwd = NULL;
    if (argc >= 5) {
        napi_valuetype vtype;
        napi_typeof(env, argv[4], &vtype);
        if (vtype == napi_string) {
            size_t cwd_len = 0;
            napi_get_value_string_utf8(env, argv[4], NULL, 0, &cwd_len);
            if (cwd_len > 0) {
                char *cwd_utf8 = (char *)malloc(cwd_len + 1);
                if (cwd_utf8) {
                    napi_get_value_string_utf8(env, argv[4], cwd_utf8, cwd_len + 1, NULL);
                    int wlen = MultiByteToWideChar(CP_UTF8, 0, cwd_utf8, -1, NULL, 0);
                    wcwd = (WCHAR *)malloc((size_t)wlen * sizeof(WCHAR));
                    if (wcwd) MultiByteToWideChar(CP_UTF8, 0, cwd_utf8, -1, wcwd, wlen);
                    free(cwd_utf8);
                }
            }
        }
    }

    /* Build wide command line */
    WCHAR *wcmd = build_wide_cmdline(exec_path, args, nargs);
    if (nargs > 0 && args) {
        uint32_t i;
        for (i = 0; i < nargs; i++) free(args[i]);
        free(args);
    }
    free(exec_path);
    if (!wcmd) {
        free(wcwd);
        napi_throw_error(env, NULL, "OOM");
        return NULL;
    }

    /*
     * Create two anonymous pipes for stdin and stdout.
     * The child-facing ends must be INHERITABLE so the child can use them.
     * The parent-facing ends are set NON-INHERITABLE so only the targeted
     * pipe handles are passed to the child.
     */
    SECURITY_ATTRIBUTES sa;
    memset(&sa, 0, sizeof(sa));
    sa.nLength        = sizeof(sa);
    sa.bInheritHandle = TRUE;  /* child-side handles inherit */

    HANDLE hStdinRead = NULL, hStdinWrite = NULL;
    HANDLE hStdoutRead = NULL, hStdoutWrite = NULL;

    if (!CreatePipe(&hStdinRead, &hStdinWrite, &sa, 0)) {
        DWORD err = GetLastError();
        free(wcmd); free(wcwd);
        return throw_win_err(env, "CreatePipe (stdin)", err);
    }
    if (!CreatePipe(&hStdoutRead, &hStdoutWrite, &sa, 0)) {
        DWORD err = GetLastError();
        CloseHandle(hStdinRead); CloseHandle(hStdinWrite);
        free(wcmd); free(wcwd);
        return throw_win_err(env, "CreatePipe (stdout)", err);
    }

    /* Make parent-side handles non-inheritable */
    SetHandleInformation(hStdinWrite, HANDLE_FLAG_INHERIT, 0);
    SetHandleInformation(hStdoutRead, HANDLE_FLAG_INHERIT, 0);

    /*
     * Use PROC_THREAD_ATTRIBUTE_HANDLE_LIST to pass only the child-side pipe
     * handles, preventing all other parent handles from being inherited.
     */
    HANDLE inherit_list[2];
    inherit_list[0] = hStdinRead;
    inherit_list[1] = hStdoutWrite;

    SIZE_T attr_size = 0;
    InitializeProcThreadAttributeList(NULL, 1, 0, &attr_size);
    LPPROC_THREAD_ATTRIBUTE_LIST attr_list =
        (LPPROC_THREAD_ATTRIBUTE_LIST)malloc(attr_size);
    if (!attr_list) {
        CloseHandle(hStdinRead);  CloseHandle(hStdinWrite);
        CloseHandle(hStdoutRead); CloseHandle(hStdoutWrite);
        free(wcmd); free(wcwd);
        napi_throw_error(env, NULL, "OOM");
        return NULL;
    }
    if (!InitializeProcThreadAttributeList(attr_list, 1, 0, &attr_size)) {
        DWORD err = GetLastError();
        free(attr_list);
        CloseHandle(hStdinRead);  CloseHandle(hStdinWrite);
        CloseHandle(hStdoutRead); CloseHandle(hStdoutWrite);
        free(wcmd); free(wcwd);
        return throw_win_err(env, "InitializeProcThreadAttributeList", err);
    }
    if (!UpdateProcThreadAttribute(attr_list, 0,
                                   PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
                                   inherit_list, sizeof(inherit_list),
                                   NULL, NULL)) {
        DWORD err = GetLastError();
        DeleteProcThreadAttributeList(attr_list);
        free(attr_list);
        CloseHandle(hStdinRead);  CloseHandle(hStdinWrite);
        CloseHandle(hStdoutRead); CloseHandle(hStdoutWrite);
        free(wcmd); free(wcwd);
        return throw_win_err(env, "UpdateProcThreadAttribute (handle list)", err);
    }

    /* STARTUPINFOEXW: redirect child stdio to our pipes */
    STARTUPINFOEXW si;
    memset(&si, 0, sizeof(si));
    si.StartupInfo.cb         = sizeof(si);
    si.StartupInfo.dwFlags    = STARTF_USESTDHANDLES;
    si.StartupInfo.hStdInput  = hStdinRead;
    si.StartupInfo.hStdOutput = hStdoutWrite;
    si.StartupInfo.hStdError  = hStdoutWrite; /* merge stderr into stdout */
    si.lpAttributeList        = attr_list;

    WCHAR *env_block = build_env_block(cols, rows);

    PROCESS_INFORMATION pi;
    memset(&pi, 0, sizeof(pi));

    BOOL ok = CreateProcessW(
        NULL,                                   /* lpApplicationName */
        wcmd,                                   /* lpCommandLine (mutable) */
        NULL,                                   /* lpProcessAttributes */
        NULL,                                   /* lpThreadAttributes */
        TRUE,                                   /* bInheritHandles — required for pipe handles */
        EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW,
        env_block,                              /* lpEnvironment */
        wcwd,                                   /* lpCurrentDirectory */
        (LPSTARTUPINFOW)&si,
        &pi
    );

    DeleteProcThreadAttributeList(attr_list);
    free(attr_list);
    free(env_block);
    free(wcmd);
    free(wcwd);

    /* Close the child-facing ends in the parent — the child owns them now */
    CloseHandle(hStdinRead);
    CloseHandle(hStdoutWrite);

    if (!ok) {
        DWORD err = GetLastError();
        CloseHandle(hStdinWrite);
        CloseHandle(hStdoutRead);
        return throw_win_err(env, "CreateProcessW", err);
    }

    int idx = session_alloc();
    if (idx < 0) {
        TerminateProcess(pi.hProcess, 1);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        CloseHandle(hStdinWrite);
        CloseHandle(hStdoutRead);
        napi_throw_error(env, NULL, "Too many active PTY sessions");
        return NULL;
    }

    g_sessions[idx].active     = TRUE;
    g_sessions[idx].hPipeWrite = hStdinWrite;
    g_sessions[idx].hPipeRead  = hStdoutRead;
    g_sessions[idx].hProcess   = pi.hProcess;
    g_sessions[idx].hThread    = pi.hThread;
    g_sessions[idx].dwPid      = pi.dwProcessId;

    napi_value result, fd_val, pid_val;
    napi_create_object(env, &result);
    napi_create_int32(env, (int32_t)(idx + 1), &fd_val);
    napi_create_int32(env, (int32_t)pi.dwProcessId, &pid_val);
    napi_set_named_property(env, result, "fd", fd_val);
    napi_set_named_property(env, result, "pid", pid_val);
    return result;
}

/* ── write ────────────────────────────────────────────────────────────────── */

static napi_value pty_write(napi_env env, napi_callback_info info)
{
    sessions_init();

    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (argc < 2) { napi_throw_error(env, NULL, "write: 2 args required"); return NULL; }

    int32_t fd;
    napi_get_value_int32(env, argv[0], &fd);
    int idx = fd - 1;
    if (idx < 0 || idx >= MAX_SESSIONS || !g_sessions[idx].active) {
        napi_throw_error(env, NULL, "write: invalid fd");
        return NULL;
    }

    void *data = NULL;
    size_t byte_len = 0;
    napi_get_buffer_info(env, argv[1], &data, &byte_len);

    const char *ptr = (const char *)data;
    DWORD remaining = (DWORD)byte_len;
    while (remaining > 0) {
        DWORD n = 0;
        if (!WriteFile(g_sessions[idx].hPipeWrite, ptr, remaining, &n, NULL) || n == 0)
            break;
        ptr      += n;
        remaining -= n;
    }
    return napi_undef(env);
}

/* ── read (non-blocking) ──────────────────────────────────────────────────── */

static napi_value pty_read(napi_env env, napi_callback_info info)
{
    sessions_init();

    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (argc < 1) { napi_throw_error(env, NULL, "read: 1 arg required"); return NULL; }

    int32_t fd;
    napi_get_value_int32(env, argv[0], &fd);
    int idx = fd - 1;
    if (idx < 0 || idx >= MAX_SESSIONS || !g_sessions[idx].active) {
        napi_value null_val;
        napi_get_null(env, &null_val);
        return null_val;
    }

    /* Non-blocking peek */
    DWORD available = 0;
    if (!PeekNamedPipe(g_sessions[idx].hPipeRead, NULL, 0, NULL, &available, NULL)
            || available == 0) {
        napi_value null_val;
        napi_get_null(env, &null_val);
        return null_val;
    }

    char buf[4096];
    DWORD to_read = available < (DWORD)sizeof(buf) ? available : (DWORD)sizeof(buf);
    DWORD n = 0;
    if (!ReadFile(g_sessions[idx].hPipeRead, buf, to_read, &n, NULL) || n == 0) {
        napi_value null_val;
        napi_get_null(env, &null_val);
        return null_val;
    }

    void *node_buf_data = NULL;
    napi_value result;
    napi_create_buffer_copy(env, (size_t)n, buf, &node_buf_data, &result);
    return result;
}

/* ── resize (no-op — pipe-based PTY has no resize capability) ─────────────── */

static napi_value pty_resize(napi_env env, napi_callback_info info)
{
    (void)info;
    return napi_undef(env);
}

/* ── kill ─────────────────────────────────────────────────────────────────── */

static napi_value pty_kill(napi_env env, napi_callback_info info)
{
    sessions_init();

    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (argc < 1) { napi_throw_error(env, NULL, "kill: 1 arg required"); return NULL; }

    int32_t pid;
    napi_get_value_int32(env, argv[0], &pid);

    int i;
    for (i = 0; i < MAX_SESSIONS; i++) {
        if (g_sessions[i].active && (DWORD)pid == g_sessions[i].dwPid) {
            TerminateProcess(g_sessions[i].hProcess, 1);
            break;
        }
    }
    return napi_undef(env);
}

/* ── waitpid ──────────────────────────────────────────────────────────────── */

static napi_value pty_waitpid(napi_env env, napi_callback_info info)
{
    sessions_init();

    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (argc < 1) { napi_throw_error(env, NULL, "waitpid: 1 arg required"); return NULL; }

    int32_t pid;
    napi_get_value_int32(env, argv[0], &pid);

    bool nonblocking = true;
    if (argc >= 2) napi_get_value_bool(env, argv[1], &nonblocking);

    bool exited = false;
    int  code   = -1;

    int i;
    for (i = 0; i < MAX_SESSIONS; i++) {
        if (!g_sessions[i].active || (DWORD)pid != g_sessions[i].dwPid) continue;
        DWORD timeout = nonblocking ? 0 : INFINITE;
        if (WaitForSingleObject(g_sessions[i].hProcess, timeout) == WAIT_OBJECT_0) {
            DWORD exit_code = 0;
            GetExitCodeProcess(g_sessions[i].hProcess, &exit_code);
            exited = true;
            code   = (int)exit_code;
        }
        break;
    }

    napi_value obj, exited_val, code_val;
    napi_create_object(env, &obj);
    napi_get_boolean(env, exited, &exited_val);
    napi_create_int32(env, code, &code_val);
    napi_set_named_property(env, obj, "exited", exited_val);
    napi_set_named_property(env, obj, "code", code_val);
    return obj;
}

/* ── close ────────────────────────────────────────────────────────────────── */

static napi_value pty_close(napi_env env, napi_callback_info info)
{
    sessions_init();

    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (argc < 1) { napi_throw_error(env, NULL, "close: 1 arg required"); return NULL; }

    int32_t fd;
    napi_get_value_int32(env, argv[0], &fd);
    int idx = fd - 1;
    if (idx < 0 || idx >= MAX_SESSIONS || !g_sessions[idx].active)
        return napi_undef(env);

    PtySession *s = &g_sessions[idx];
    CloseHandle(s->hPipeWrite);
    CloseHandle(s->hPipeRead);
    CloseHandle(s->hProcess);
    CloseHandle(s->hThread);
    memset(s, 0, sizeof(*s));
    return napi_undef(env);
}

/* ── module init ──────────────────────────────────────────────────────────── */

static napi_value Init(napi_env env, napi_value exports)
{
    static const struct { const char *name; napi_callback fn; } funcs[] = {
        { "spawn",   pty_spawn   },
        { "write",   pty_write   },
        { "read",    pty_read    },
        { "resize",  pty_resize  },
        { "kill",    pty_kill    },
        { "waitpid", pty_waitpid },
        { "close",   pty_close   },
    };
    size_t i;
    for (i = 0; i < sizeof(funcs) / sizeof(funcs[0]); i++) {
        napi_value fn;
        napi_create_function(env, funcs[i].name, NAPI_AUTO_LENGTH,
                             funcs[i].fn, NULL, &fn);
        napi_set_named_property(env, exports, funcs[i].name, fn);
    }
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
