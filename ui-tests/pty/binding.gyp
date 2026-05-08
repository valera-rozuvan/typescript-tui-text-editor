{
  "targets": [
    {
      "target_name": "pty_native",
      "sources": ["pty.c"],
      "conditions": [
        ["OS=='linux'", {
          "libraries": ["-lutil"]
        }]
      ]
    }
  ]
}
