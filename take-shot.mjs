import { chromium } from 'playwright-core';

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || 
  '/usr/bin/chromium-browser' || 
  '/usr/bin/chromium' ||
  '/usr/bin/google-chrome';

const browser = await chromium.launch({ 
  executablePath: CHROMIUM_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'] 
}).catch(() => null);

if (!browser) { console.log('no chromium'); process.exit(1); }

const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('http://localhost:5175', { waitUntil: 'networkidle', timeout: 15000 });
await page.screenshot({ path: '/tmp/shots/redesign-new.png', fullPage: false });
console.log('screenshot: /tmp/shots/redesign-new.png');
await browser.close();
