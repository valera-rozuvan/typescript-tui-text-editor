/*
 * pty.c — N-API native addon that exposes POSIX pseudo-terminal primitives
 * to Node.js for use in end-to-end UI tests.
 *
 * Exported functions:
 *   spawn(execPath, args[], cols, rows) → { fd, pid }
 *   write(fd, buffer)
 *   read(fd) → Buffer | null        (non-blocking)
 *   resize(fd, cols, rows)
 *   kill(pid, signal)
 *   waitpid(pid, nonblocking?) → { exited, code }
 *   close(fd)
 *
 * Build: npx node-gyp configure build  (from ui-tests/pty/)
 * Linux: links -lutil for forkpty()
 */

#define NAPI_VERSION 6
#include <node_api.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <signal.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <sys/ioctl.h>
#include <termios.h>

#ifdef __APPLE__
#  include <util.h>
#else
#  include <pty.h>
#endif

/* ── helpers ──────────────────────────────────────────────────────────────── */

static napi_value throw_errno(napi_env env, const char *prefix)
{
    char msg[256];
    snprintf(msg, sizeof(msg), "%s: %s", prefix, strerror(errno));
    napi_throw_error(env, NULL, msg);
    return NULL;
}

static napi_value undef(napi_env env)
{
    napi_value v;
    napi_get_undefined(env, &v);
    return v;
}

/* ── spawn ────────────────────────────────────────────────────────────────── */

static napi_value pty_spawn(napi_env env, napi_callback_info info)
{
    size_t argc = 5;
    napi_value argv[5];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (argc < 4) { napi_throw_error(env, NULL, "spawn: 4 args required"); return NULL; }

    /* execPath */
    size_t exec_len = 0;
    napi_get_value_string_utf8(env, argv[0], NULL, 0, &exec_len);
    char *exec_path = malloc(exec_len + 1);
    if (!exec_path) { napi_throw_error(env, NULL, "OOM"); return NULL; }
    napi_get_value_string_utf8(env, argv[0], exec_path, exec_len + 1, NULL);

    /* args[] */
    uint32_t nargs = 0;
    napi_get_array_length(env, argv[1], &nargs);
    char **child_argv = calloc(nargs + 2, sizeof(char *));
    if (!child_argv) { free(exec_path); napi_throw_error(env, NULL, "OOM"); return NULL; }
    child_argv[0] = exec_path;
    for (uint32_t i = 0; i < nargs; i++) {
        napi_value elem;
        napi_get_element(env, argv[1], i, &elem);
        size_t len = 0;
        napi_get_value_string_utf8(env, elem, NULL, 0, &len);
        child_argv[i + 1] = malloc(len + 1);
        if (!child_argv[i + 1]) {
            for (uint32_t j = 0; j < i + 1; j++) free(child_argv[j]);
            free(child_argv);
            napi_throw_error(env, NULL, "OOM"); return NULL;
        }
        napi_get_value_string_utf8(env, elem, child_argv[i + 1], len + 1, NULL);
    }
    child_argv[nargs + 1] = NULL;

    /* terminal size */
    int32_t cols = 80, rows = 24;
    napi_get_value_int32(env, argv[2], &cols);
    napi_get_value_int32(env, argv[3], &rows);

    /* optional working directory (argv[4]) */
    char *child_cwd = NULL;
    if (argc >= 5) {
        napi_valuetype vtype;
        napi_typeof(env, argv[4], &vtype);
        if (vtype == napi_string) {
            size_t cwd_len = 0;
            napi_get_value_string_utf8(env, argv[4], NULL, 0, &cwd_len);
            if (cwd_len > 0) {
                child_cwd = malloc(cwd_len + 1);
                if (child_cwd)
                    napi_get_value_string_utf8(env, argv[4], child_cwd, cwd_len + 1, NULL);
            }
        }
    }

    struct winsize ws;
    memset(&ws, 0, sizeof(ws));
    ws.ws_col = (unsigned short)cols;
    ws.ws_row = (unsigned short)rows;

    int master_fd = -1;
    pid_t pid = forkpty(&master_fd, NULL, NULL, &ws);
    if (pid < 0) {
        for (uint32_t i = 0; i <= nargs; i++) free(child_argv[i]);
        free(child_argv);
        free(child_cwd);
        return throw_errno(env, "forkpty");
    }

    if (pid == 0) {
        /* child process */
        if (child_cwd) chdir(child_cwd);
        setenv("TERM", "xterm-256color", 1);
        setenv("COLORTERM", "truecolor", 1);
        execv(exec_path, child_argv);
        perror("execv");
        _exit(127);
    }

    /* parent — strings were copied by fork; free our copies */
    for (uint32_t i = 0; i <= nargs; i++) free(child_argv[i]);
    free(child_argv);
    free(child_cwd);

    /* make master fd non-blocking so read() returns EAGAIN when no data */
    int flags = fcntl(master_fd, F_GETFL, 0);
    fcntl(master_fd, F_SETFL, flags | O_NONBLOCK);

    napi_value result, fd_val, pid_val;
    napi_create_object(env, &result);
    napi_create_int32(env, master_fd, &fd_val);
    napi_create_int32(env, (int32_t)pid, &pid_val);
    napi_set_named_property(env, result, "fd", fd_val);
    napi_set_named_property(env, result, "pid", pid_val);
    return result;
}

/* ── write ────────────────────────────────────────────────────────────────── */

static napi_value pty_write(napi_env env, napi_callback_info info)
{
    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (argc < 2) { napi_throw_error(env, NULL, "write: 2 args required"); return NULL; }

    int32_t fd;
    napi_get_value_int32(env, argv[0], &fd);

    void *data = NULL;
    size_t byte_len = 0;
    napi_get_buffer_info(env, argv[1], &data, &byte_len);

    ssize_t written = 0;
    while (written < (ssize_t)byte_len) {
        ssize_t n = write(fd, (char *)data + written, byte_len - written);
        if (n < 0) {
            if (errno == EINTR) continue;
            break; /* EIO / EPIPE: child has exited */
        }
        written += n;
    }
    return undef(env);
}

/* ── read (non-blocking) ──────────────────────────────────────────────────── */

static napi_value pty_read(napi_env env, napi_callback_info info)
{
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (argc < 1) { napi_throw_error(env, NULL, "read: 1 arg required"); return NULL; }

    int32_t fd;
    napi_get_value_int32(env, argv[0], &fd);

    char buf[4096];
    ssize_t n = read(fd, buf, sizeof(buf));
    if (n <= 0) {
        napi_value null_val;
        napi_get_null(env, &null_val);
        return null_val;
    }

    void *node_buf_data = NULL;
    napi_value result;
    napi_create_buffer_copy(env, (size_t)n, buf, &node_buf_data, &result);
    return result;
}

/* ── resize ───────────────────────────────────────────────────────────────── */

static napi_value pty_resize(napi_env env, napi_callback_info info)
{
    size_t argc = 3;
    napi_value argv[3];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (argc < 3) { napi_throw_error(env, NULL, "resize: 3 args required"); return NULL; }

    int32_t fd, cols, rows;
    napi_get_value_int32(env, argv[0], &fd);
    napi_get_value_int32(env, argv[1], &cols);
    napi_get_value_int32(env, argv[2], &rows);

    struct winsize ws;
    memset(&ws, 0, sizeof(ws));
    ws.ws_col = (unsigned short)cols;
    ws.ws_row = (unsigned short)rows;
    ioctl(fd, TIOCSWINSZ, &ws);
    return undef(env);
}

/* ── kill ─────────────────────────────────────────────────────────────────── */

static napi_value pty_kill(napi_env env, napi_callback_info info)
{
    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (argc < 1) { napi_throw_error(env, NULL, "kill: 1 arg required"); return NULL; }

    int32_t pid;
    napi_get_value_int32(env, argv[0], &pid);
    int32_t sig = SIGTERM;
    if (argc >= 2) napi_get_value_int32(env, argv[1], &sig);

    kill((pid_t)pid, sig);
    return undef(env);
}

/* ── waitpid ──────────────────────────────────────────────────────────────── */

static napi_value pty_waitpid(napi_env env, napi_callback_info info)
{
    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (argc < 1) { napi_throw_error(env, NULL, "waitpid: 1 arg required"); return NULL; }

    int32_t pid;
    napi_get_value_int32(env, argv[0], &pid);

    bool nonblocking = true;
    if (argc >= 2) napi_get_value_bool(env, argv[1], &nonblocking);

    int status = 0;
    pid_t ret = waitpid((pid_t)pid, &status, nonblocking ? WNOHANG : 0);

    bool exited = (ret == (pid_t)pid);
    int code = (exited && WIFEXITED(status)) ? WEXITSTATUS(status) : -1;

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
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (argc < 1) { napi_throw_error(env, NULL, "close: 1 arg required"); return NULL; }

    int32_t fd;
    napi_get_value_int32(env, argv[0], &fd);
    close(fd);
    return undef(env);
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
    for (size_t i = 0; i < sizeof(funcs) / sizeof(funcs[0]); i++) {
        napi_value fn;
        napi_create_function(env, funcs[i].name, NAPI_AUTO_LENGTH, funcs[i].fn, NULL, &fn);
        napi_set_named_property(env, exports, funcs[i].name, fn);
    }
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
