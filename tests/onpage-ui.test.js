#!/usr/bin/env node
/*
 * The on-page ⚡ button, the fill message (toast) and pasting into TTD fields:
 * loads the UNPACKED extension into Chromium (or Edge) against a React 18
 * stand-in for a pilgrim-details page whose text field, like TTD's since
 * Oct 2026, ignores untrusted input events.
 *
 *   REACT_UMD_DIR=/path/to/node_modules NODE_PATH=$(npm root -g) node tests/onpage-ui.test.js
 *
 * CHROMIUM_PATH picks the browser (default /opt/pw-browsers/chromium). On
 * Windows, Edge works: CHROMIUM_PATH="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe".
 *
 * Covers:
 *   - the Self-QC / fill message has a ✕ that closes it, can be dragged, and
 *     the dropped spot is saved (toastFreePos) and reused;
 *   - toastMode "hidden" shows no message;
 *   - fabPosition corners place the button, "free" + a drag saves fabFreePos,
 *     "hidden" removes the button while Alt+A still fills;
 *   - pasting into a field that cancels paste, a digits-only Aadhaar field
 *     ("8888 7777 6666\n" → 888877776666) and a mobile ("+91 98765 43210").
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const EXT = path.resolve(__dirname, '..', 'ttd-form-helper');
const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const RDIR = process.env.REACT_UMD_DIR;
if (!RDIR) throw new Error('set REACT_UMD_DIR to a node_modules holding react@18 and react-dom@18');
const REACT = fs.readFileSync(path.join(RDIR, 'react/umd/react.production.min.js'), 'utf8');
const REACT_DOM = fs.readFileSync(path.join(RDIR, 'react-dom/umd/react-dom.production.min.js'), 'utf8');

let pass = 0, fail = 0;
const G = t => console.log('\n' + t);
function ok(cond, label, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

const PAGE = `<!doctype html><html><body style="margin:0;height:100vh"><div id="root"></div>
<script>${REACT}</script><script>${REACT_DOM}</script>
<script>
const e = React.createElement;
const setDom = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
  el._valueTracker && el._valueTracker.setValue(v); };
// TTD's shared field: untrusted onChange is put back. 'kind' is its check.
function Field(p) {
  const onChange = ev => {
    if (!(ev.nativeEvent && ev.nativeEvent.isTrusted)) { setDom(ev.target, p.value || ''); return; }
    const v = ev.target.value;
    if (v && p.kind === 'number' && !/^[0-9]+$/.test(v)) return;
    if (v && p.kind === 'textWithSpace' && !/^[a-z A-Z]+$/.test(v)) return;
    p.onChange(ev);
  };
  return e('input', { name: p.name, value: p.value || '', maxLength: p.maxLength, onChange,
    onPaste: p.noPaste ? ev => ev.preventDefault() : undefined });
}
function App() {
  const [s, set] = React.useState({ name: '', age: '', idNumber: '', mobile: '' });
  window.__s = s;
  const f = (name, kind, extra) => e(Field, Object.assign({ name, kind, value: s[name],
    onChange: ev => set(x => Object.assign({}, x, { [name]: ev.target.value })) }, extra || {}));
  return e('div', null, f('name', 'textWithSpace', { noPaste: true }), f('age', 'number', { maxLength: 3 }),
    f('idNumber', 'number', { maxLength: 12 }), f('mobile', 'number', { maxLength: 10 }));
}
ReactDOM.createRoot(document.getElementById('root')).render(e(App));
</script></body></html>`;

const PILGRIMS = [{ id: 'a', name: 'Ramaiah Sastry', age: '66', gender: 'Male', idProof: 'Aadhaar Card', idNumber: '999988887777' }];

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tfh-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: CHROME, headless: true, viewport: { width: 1200, height: 800 },
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT]
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  for (let i = 0; i < 50 && !(await sw.evaluate(() => !!(self.chrome && chrome.storage))); i++) await new Promise(r => setTimeout(r, 100));
  ok(!!sw.url(), 'extension loaded (service worker up)', sw.url());

  await ctx.route('https://ttdevasthanams.ap.gov.in/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
  const setStore = items => sw.evaluate(async (items) => { await chrome.storage.local.set(items); }, items);
  const getStore = keys => sw.evaluate(async (keys) => chrome.storage.local.get(keys), keys);
  await sw.evaluate(async (items) => { await chrome.storage.local.clear(); await chrome.storage.local.set(items); }, { pilgrims: PILGRIMS });

  const page = await ctx.newPage();
  page.on('pageerror', e => { fail++; console.log('  FAIL  page error: ' + e.message); });
  await page.goto('https://ttdevasthanams.ap.gov.in/arjitha-seva/pilgrim-details');
  await page.waitForSelector('#ttdfh-fill-button', { timeout: 8000 }).catch(() => {});
  const fabBox = () => page.evaluate(() => {
    const w = document.getElementById('ttdfh-fab-wrap');
    if (!w) return null;
    const r = w.getBoundingClientRect();
    return { x: r.left, y: r.top, r: innerWidth - r.right, b: innerHeight - r.bottom };
  });
  const waitFab = pred => page.waitForFunction(pred, null, { timeout: 3000 }).catch(() => {});

  G('Fill message: close, drag, remembered spot, hidden');
  {
    await page.click('#ttdfh-fill-button');
    // The fill's own message is followed by the Self-QC one; take the last.
    await page.waitForFunction(() => /Self-QC/.test((document.getElementById('ttdfh-fill-toast') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
    const t = await page.$('#ttdfh-fill-toast');
    ok(!!t, 'a fill shows the message');
    ok(!!(t && await t.$('button[aria-label="Close message"]')), 'the message has a ✕ close button');
    let box = t && await t.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 30, box.y + 15);
      await page.mouse.down();
      await page.mouse.move(box.x - 200, box.y - 300, { steps: 8 });
      await page.mouse.up();
    }
    await page.waitForTimeout(200);
    const saved = (await getStore(['toastFreePos'])).toastFreePos;
    ok(saved && Math.abs(saved.x - (box.x - 230)) < 10 && Math.abs(saved.y - (box.y - 315)) < 10, 'a drag moves the message and saves where it was dropped', { saved, box });
    await page.click('#ttdfh-fill-toast button[aria-label="Close message"]');
    ok(!(await page.$('#ttdfh-fill-toast')), '✕ closes the message');
    await page.click('#ttdfh-fill-button');
    await page.waitForSelector('#ttdfh-fill-toast', { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(100);
    const again = await page.evaluate(() => { const n = document.getElementById('ttdfh-fill-toast'); if (!n) return { x: -1, y: -1 }; const r = n.getBoundingClientRect(); return { x: r.left, y: r.top }; });
    ok(saved && Math.abs(again.x - saved.x) < 3 && Math.abs(again.y - saved.y) < 3, 'the next message opens where the last was dropped', { again, saved });
    await page.click('#ttdfh-fill-toast button[aria-label="Close message"]');
    await setStore({ toastMode: 'hidden' });
    await page.waitForTimeout(100);
    await page.click('#ttdfh-fill-button');
    await page.waitForTimeout(1500);
    ok(!(await page.$('#ttdfh-fill-toast')), 'toastMode "hidden" shows no message');
    await setStore({ toastMode: 'show', toastFreePos: null });
  }

  G('⚡ button: corners, free drag, hidden with Alt+A');
  {
    let b = await fabBox();
    ok(b && Math.abs(b.r - 22) < 2 && Math.abs(b.b - 22) < 2, 'default is bottom right', b);
    await setStore({ fabPosition: 'top-left' });
    await waitFab(() => { const w = document.getElementById('ttdfh-fab-wrap'); return w && w.style.left === '22px'; });
    b = await fabBox();
    ok(b && Math.abs(b.x - 22) < 2 && Math.abs(b.y - 22) < 2, 'top-left moves it at once, no reload', b);
    ok(await page.evaluate(() => document.getElementById('ttdfh-fab-wrap').classList.contains('ttdfh-at-top')), 'its menu opens downward at the top');
    await setStore({ fabPosition: 'bottom-left' });
    await waitFab(() => { const w = document.getElementById('ttdfh-fab-wrap'); return w && w.style.bottom === '22px' && w.style.left === '22px'; });
    b = await fabBox();
    ok(b && Math.abs(b.x - 22) < 2 && Math.abs(b.b - 22) < 2, 'bottom-left', b);

    const btn = await page.$('#ttdfh-fill-button');
    const bb = await btn.boundingBox();
    const before = await page.evaluate(() => window.__s.name);
    await page.mouse.move(bb.x + 29, bb.y + 29);
    await page.mouse.down();
    await page.mouse.move(600, 300, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const st = await getStore(['fabPosition', 'fabFreePos']);
    ok(st.fabPosition === 'free' && st.fabFreePos && Math.abs(st.fabFreePos.x - (600 - 29)) < 6, 'dragging the button switches to "free" and saves the spot', st);
    ok((await page.evaluate(() => window.__s.name)) === before, 'a drag is not a click (no fill ran)');

    await setStore({ fabPosition: 'hidden' });
    await page.waitForFunction(() => !document.getElementById('ttdfh-fab-wrap'), null, { timeout: 3000 }).catch(() => {});
    ok(!(await page.$('#ttdfh-fab-wrap')), '"hidden" removes the button');
    await page.evaluate(() => { const i = document.querySelector('input[name="name"]'); i.focus(); });
    await page.keyboard.press('Alt+KeyA');
    await page.waitForFunction(() => window.__s.name === 'Ramaiah Sastry', null, { timeout: 6000 }).catch(() => {});
    ok((await page.evaluate(() => window.__s.name)) === 'Ramaiah Sastry', 'Alt+A still fills with the button hidden');
    await setStore({ fabPosition: 'bottom-right', fabFreePos: null });
  }

  G('Pasting into TTD fields');
  {
    await page.reload();
    await page.waitForSelector('input[name="name"]');
    // A real Ctrl+V needs clipboard access; a dispatched paste event carries the
    // same clipboardData, and what the handler then types is trusted either way.
    const paste = (name, text) => page.evaluate(([name, text]) => {
      const el = document.querySelector('input[name="' + name + '"]');
      el.focus();
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, [name, text]);
    await paste('name', '  Kamala   Sastry\n');
    await paste('idNumber', '8888 7777 6666\n');
    await paste('mobile', '+91 98765 43210');
    await paste('age', ' 62 ');
    await page.waitForTimeout(200);
    const s = await page.evaluate(() => window.__s);
    ok(s.name === 'Kamala Sastry', 'a field that cancels paste takes the pasted name (spaces tidied)', s.name);
    ok(s.idNumber === '888877776666', 'a grouped Aadhaar pastes as 12 digits into the digits-only field', s.idNumber);
    ok(s.mobile === '9876543210', '"+91 98765 43210" pastes as the 10-digit mobile', s.mobile);
    ok(s.age === '62', 'stray spaces around an age are dropped', s.age);

    await setStore({ allowPaste: false });
    await page.waitForTimeout(100);
    await paste('name', 'Other Name');
    await page.waitForTimeout(100);
    ok((await page.evaluate(() => window.__s.name)) === 'Kamala Sastry', 'with paste help off, the page\'s own paste handling is left alone');
  }

  await ctx.close();
  console.log('\nonpage-ui: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
