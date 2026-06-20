import { _electron as electron } from 'playwright-core';
import * as path from 'node:path';
import * as fs from 'node:fs';

const APP_DIR = '/home/akrist/Documents/cloud-code/forbiden-electron';
const SHOT_DIR = '/tmp/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/electron');

const app = await electron.launch({
  executablePath: electronBin,
  args: ['--no-sandbox', APP_DIR],
  timeout: 40_000,
});

await new Promise(r => setTimeout(r, 8000));

const windows = app.windows();
console.log('windows:', windows.length);
for (const w of windows) console.log(' ', w.url());

const page = windows.find(w => !w.url().startsWith('devtools://')) ?? await app.firstWindow();
await page.screenshot({ path: '/tmp/shots/editor-redesign.png' });
console.log('screenshot saved to /tmp/shots/editor-redesign.png');

await app.close();
