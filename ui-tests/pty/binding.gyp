{
  "targets": [
    {
      "target_name": "pty_native",
      "conditions": [
        ["OS=='win'", {
          "sources": ["pty_win.c"],
          "libraries": []
        }],
        ["OS=='linux'", {
          "sources": ["pty.c"],
          "libraries": ["-lutil"]
        }],
        ["OS=='mac'", {
          "sources": ["pty.c"],
          "libraries": []
        }]
      ]
    }
  ]
}
