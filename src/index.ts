import { Editor } from './editor/Editor.js';

async function main(): Promise<void> {
  const editor = new Editor();
  const filePath = process.argv[2];
  if (filePath) {
    await editor.openFile(filePath);
  }
  editor.start();
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
