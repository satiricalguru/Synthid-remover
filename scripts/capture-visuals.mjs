import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.join(__dirname, '..', 'public', 'screenshots');

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    // Dynamic import of WebSocket
    const WebSocket = globalThis.WebSocket || (await import('ws')).default;
    this.ws = new WebSocket(this.wsUrl);
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function capture() {
  console.log('[1/5] Launching Chrome in headless mode with remote debugging...');
  const chromeProcess = spawn(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    [
      '--headless',
      '--remote-debugging-port=9222',
      '--window-size=1280,1024',
      '--hide-scrollbars',
      'http://localhost:3000',
    ],
    { stdio: 'ignore' }
  );

  // Wait for remote debugging to be ready
  let targets;
  for (let i = 0; i < 20; i++) {
    try {
      targets = await getJson('http://localhost:9222/json');
      if (targets && targets.length > 0) break;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (!targets || targets.length === 0) {
    chromeProcess.kill();
    throw new Error('Failed to connect to headless Chrome remote debugging port.');
  }

  const target = targets.find((t) => t.type === 'page') || targets[0];
  console.log('[2/5] Connected to Chrome page target:', target.url);

  const client = new CDPClient(target.webSocketDebuggerUrl);
  await client.connect();

  await client.send('Page.enable');
  await client.send('DOM.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 1024,
    deviceScaleFactor: 2, // Retina 2x for ultra-crisp screenshots
    mobile: false,
  });

  // Wait 2s for all fonts, styles, and hero component to hydrate
  await new Promise((r) => setTimeout(r, 2000));

  console.log('[3/5] Capturing Hero section (hero.png)...');
  const heroClip = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.querySelector('section');
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })()`,
    returnByValue: true,
  });

  if (heroClip.result.value) {
    const res = await client.send('Page.captureScreenshot', {
      format: 'png',
      clip: {
        x: heroClip.result.value.x,
        y: heroClip.result.value.y,
        width: heroClip.result.value.width,
        height: Math.min(heroClip.result.value.height, 900),
        scale: 1,
      },
    });
    fs.writeFileSync(path.join(screenshotsDir, 'hero.png'), Buffer.from(res.data, 'base64'));
    console.log('  ✅ Saved public/screenshots/hero.png');
  }

  console.log('[4/5] Capturing Workspace section with Mode Selector & Provenance Audit (workspace.png)...');
  const workspaceClip = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.getElementById('workspace') || document.querySelector('section:nth-of-type(2)');
      el.scrollIntoView({ behavior: 'instant' });
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: window.scrollY + rect.y, width: rect.width, height: rect.height };
    })()`,
    returnByValue: true,
  });

  if (workspaceClip.result.value) {
    await new Promise((r) => setTimeout(r, 500));
    const res = await client.send('Page.captureScreenshot', {
      format: 'png',
      clip: {
        x: workspaceClip.result.value.x,
        y: workspaceClip.result.value.y,
        width: workspaceClip.result.value.width,
        height: Math.min(workspaceClip.result.value.height, 1050),
        scale: 1,
      },
    });
    fs.writeFileSync(path.join(screenshotsDir, 'workspace.png'), Buffer.from(res.data, 'base64'));
    console.log('  ✅ Saved public/screenshots/workspace.png');
  }

  console.log('[5/5] Capturing How It Works (how-it-works.png) and FAQ (faq.png)...');
  const howClip = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.getElementById('how-it-works');
      if (!el) return null;
      el.scrollIntoView({ behavior: 'instant' });
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: window.scrollY + rect.y, width: rect.width, height: rect.height };
    })()`,
    returnByValue: true,
  });

  if (howClip.result.value) {
    await new Promise((r) => setTimeout(r, 500));
    const res = await client.send('Page.captureScreenshot', {
      format: 'png',
      clip: {
        x: howClip.result.value.x,
        y: howClip.result.value.y,
        width: howClip.result.value.width,
        height: howClip.result.value.height,
        scale: 1,
      },
    });
    fs.writeFileSync(path.join(screenshotsDir, 'how-it-works.png'), Buffer.from(res.data, 'base64'));
    console.log('  ✅ Saved public/screenshots/how-it-works.png');
  }

  const faqClip = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.getElementById('faq');
      if (!el) return null;
      el.scrollIntoView({ behavior: 'instant' });
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: window.scrollY + rect.y, width: rect.width, height: rect.height };
    })()`,
    returnByValue: true,
  });

  if (faqClip.result.value) {
    await new Promise((r) => setTimeout(r, 500));
    const res = await client.send('Page.captureScreenshot', {
      format: 'png',
      clip: {
        x: faqClip.result.value.x,
        y: faqClip.result.value.y,
        width: faqClip.result.value.width,
        height: Math.min(faqClip.result.value.height, 900),
        scale: 1,
      },
    });
    fs.writeFileSync(path.join(screenshotsDir, 'faq.png'), Buffer.from(res.data, 'base64'));
    console.log('  ✅ Saved public/screenshots/faq.png');
  }

  client.close();
  chromeProcess.kill();
  console.log('🎉 All screenshots updated successfully with the latest UI!');
}

capture().catch((e) => {
  console.error('Capture failed:', e);
  process.exit(1);
});
