#!/usr/bin/env node
/*
 * Senior Citizen (PLD) support — loads the UNPACKED extension into Chromium and
 * drives it against a stand-in for TTD's /pld/pilgrim-details step.
 *
 *   REACT_UMD_DIR=/path/to/node_modules NODE_PATH=$(npm root -g) node tests/senior-citizen.test.js
 *
 * REACT_UMD_DIR must hold react@18 and react-dom@18 (their umd/ builds), e.g.
 * after `npm i react@18 react-dom@18` somewhere. The stand-in page is a REAL
 * React app, because the question that matters is whether a file put on the
 * input by the content script reaches React's onChange: the content script runs
 * in an isolated world and cannot see React's __reactProps$ at all, so only the
 * native `change` event can deliver it.
 *
 * What the stand-in copies from the site (pages/pld/[section] chunk in
 * TTD/SeniorCitizen/SeniorCitizen_Success23_SEp.zip):
 *   - pilgrim rows: input[name=name] / [name=age] / [name=idNumber]
 *   - contact: pilgrimEmail / pilgrimCity / pilgrimState / pilgrimCountry / pilgrimPincode
 *   - "Upload Document": a hidden <input type=file accept=".jpeg,.png,.pdf"> whose
 *     onChange reads target.files[0] and rejects size > 1024e3
 * Gender / ID-type dropdowns are left out: that code is shared with every other
 * darshan flow and unchanged here.
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

const PAGE = `<!doctype html><html><body><div id="root"></div>
<script>${REACT}</script><script>${REACT_DOM}</script>
<script>
const e = React.createElement;
function Row({ i, ageLocked }) {
  const [p, setP] = React.useState({ name: '', age: ageLocked || '', idNumber: '' });
  window['__row' + i] = p;
  const f = k => ({ name: k, value: p[k], onChange: ev => setP(Object.assign({}, p, { [k]: ev.target.value })) });
  return e('div', { className: 'pilgrimRow' },
    e('input', f('name')),
    e('input', Object.assign(f('age'), { disabled: !!ageLocked && i === 0 })),
    e('input', f('idNumber')));
}
function App() {
  const [c, setC] = React.useState({ pilgrimEmail: '', pilgrimCity: '', pilgrimState: '', pilgrimCountry: '', pilgrimPincode: '' });
  const [doc, setDoc] = React.useState(null);
  const [err, setErr] = React.useState('');
  window.__contact = c; window.__doc = doc; window.__docErr = err;
  const f = k => ({ name: k, value: c[k], onChange: ev => setC(Object.assign({}, c, { [k]: ev.target.value })) });
  // The site's handler, reduced: case 3 of its upload onChange.
  const onFile = ev => { const x = ev.target.files[0]; if (!x) return;
    if (x.size > 1024e3) { setErr('Max. file size is 1 MB'); setDoc(null); } else { setErr(''); setDoc(x); } };
  return e('div', null,
    e(Row, { i: 0, ageLocked: '66' }), e(Row, { i: 1 }),
    e('input', f('pilgrimEmail')), e('input', f('pilgrimCity')), e('input', f('pilgrimState')),
    e('input', f('pilgrimCountry')), e('input', f('pilgrimPincode')),
    e('label', null, 'Upload Document', e('input', { type: 'file', style: { display: 'none' }, accept: '.jpeg,.png,.pdf', onChange: onFile })),
    e('span', { id: 'docName' }, doc ? doc.name : ''),
    e('button', { id: 'cont', disabled: !doc }, 'Continue'));
}
ReactDOM.createRoot(document.getElementById('root')).render(e(App));
</script></body></html>`;

const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n% synthetic\n'), Buffer.alloc(4000, 0x41), Buffer.from('\n%%EOF\n')]);
const dataUrl = b => 'data:application/pdf;base64,' + b.toString('base64');
const PILGRIMS = [
  { id: 'a', name: 'Ramaiah Sastry', age: '66', gender: 'Male', idProof: 'Aadhaar Card', idNumber: '999988887777',
    email: 'who@example.com', city: 'Hyderabad', state: 'Telangana', country: 'India', pincode: '500068' },
  { id: 'b', name: 'Kamala Sastry', age: '58', gender: 'Female', idProof: 'Aadhaar Card', idNumber: '888877776666' },
  { id: 'c', name: 'Third Person', age: '40', gender: 'Male', idProof: 'Aadhaar Card', idNumber: '777766665555' }
];

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tfh-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: CHROME, headless: true,
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT]
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  // The extension APIs are bound a moment after the worker itself appears.
  for (let i = 0; i < 50 && !(await sw.evaluate(() => !!(self.chrome && chrome.storage))); i++) await new Promise(r => setTimeout(r, 100));
  const extId = sw.url().split('/')[2];
  ok(!!extId, 'extension loaded (service worker up)', sw.url());

  await ctx.route('https://ttdevasthanams.ap.gov.in/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
  const seed = (items) => sw.evaluate(async (items) => { await chrome.storage.local.clear(); await chrome.storage.local.set(items); }, items);
  const contact = { email: 'who@example.com', city: 'Hyderabad', state: 'Telangana', country: 'India', pincode: '500068' };
  const proof = { data: dataUrl(pdf), name: 'Aadhaar_Synthetic.pdf', type: 'application/pdf', size: pdf.length, savedAt: Date.now() };

  async function openPld() {
    const page = await ctx.newPage();
    page.on('pageerror', e => { fail++; console.log('  FAIL  page error: ' + e.message); });
    await page.goto('https://ttdevasthanams.ap.gov.in/pld/pilgrim-details?section=slot-booking&flow=pld&flowIdentifier=pld');
    await page.waitForSelector('#ttdfh-fill-button', { timeout: 8000 }).catch(() => {});
    return page;
  }
  const state = page => page.evaluate(() => ({
    r0: window.__row0, r1: window.__row1, c: window.__contact,
    doc: window.__doc ? { name: window.__doc.name, size: window.__doc.size, type: window.__doc.type } : null,
    err: window.__docErr, shown: document.getElementById('docName').textContent, cont: document.getElementById('cont').disabled
  }));
  const toastText = page => page.evaluate(() => (document.getElementById('ttdfh-fill-toast') || {}).textContent || '');

  G('On-page button on /pld/pilgrim-details');
  await seed({ pilgrims: PILGRIMS, contact, seniorProof: proof });
  let page = await openPld();
  ok(!!(await page.$('#ttdfh-fill-button')), 'the floating Fill button appears');
  ok(/Fill Senior Citizen/.test(await page.evaluate(() => document.getElementById('ttdfh-pop-title').textContent)), 'and is labelled "Fill Senior Citizen"');
  await page.click('#ttdfh-fill-button');
  await page.waitForFunction(() => window.__doc, null, { timeout: 8000 }).catch(() => {});
  let s = await state(page);
  ok(s.r0.name === 'Ramaiah Sastry' && s.r1.name === 'Kamala Sastry', 'both rows reach React state', { r0: s.r0, r1: s.r1 });
  ok(s.r0.idNumber === '999988887777' && s.r1.idNumber === '888877776666' && s.r1.age === '58', 'ID numbers and the spouse\'s age too');
  ok(s.r0.age === '66', 'the locked (disabled) age carried from the slot step is left alone', s.r0.age);
  ok(s.c.pilgrimCity === 'Hyderabad' && s.c.pilgrimPincode === '500068' && s.c.pilgrimEmail === 'who@example.com', 'contact block filled', s.c);
  ok(s.doc && s.doc.name === 'Aadhaar_Synthetic.pdf' && s.doc.size === pdf.length && s.doc.type === 'application/pdf',
     'the age proof reached React\'s onChange (from an isolated world, via the native change event)', s.doc);
  ok(s.shown === 'Aadhaar_Synthetic.pdf' && s.cont === false, 'the page shows the file name and enables Continue', { shown: s.shown, cont: s.cont });
  await page.waitForFunction(() => /Age proof|pilgrim/.test((document.getElementById('ttdfh-fill-toast') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
  const t1 = await toastText(page);
  ok(/Only the first 2 pilgrims/.test(t1) && /Age proof attached/.test(t1), 'the toast reports the third pilgrim was left out and the proof attached', t1.slice(0, 300));
  await page.close();

  G('Popup message FILL_SENIOR (as the panel sends it)');
  await seed({ pilgrims: PILGRIMS.slice(0, 2), contact });
  page = await openPld();
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://ttdevasthanams.ap.gov.in/*' })).pop().id);
  const resp = await sw.evaluate(([tabId, pilgrims, contact, proof]) => new Promise(res =>
    chrome.tabs.sendMessage(tabId, { action: 'FILL_SENIOR', data: { pilgrims, contact, proof } }, res)), [tabId, PILGRIMS.slice(0, 2), contact, proof]);
  ok(resp && resp.status === 'success' && resp.filled === 2 && resp.proofState === 'attached', 'responds filled=2, proofState=attached', resp && { s: resp.status, f: resp.filled, p: resp.proofState });
  s = await state(page);
  ok(s.doc && s.doc.name === 'Aadhaar_Synthetic.pdf', 'file on the page');
  await page.close();

  G('Proof states the fill reports');
  page = await openPld();
  const r2 = await sw.evaluate(([tabId, pilgrims]) => new Promise(res =>
    chrome.tabs.sendMessage(tabId, { action: 'FILL_SENIOR', data: { pilgrims, contact: {}, proof: null } }, res)),
    [await sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://ttdevasthanams.ap.gov.in/*' })).pop().id), PILGRIMS.slice(0, 2)]);
  ok(r2 && r2.proofState === 'missing', 'no saved proof on a page that wants one -> "missing"', r2 && r2.proofState);
  const big = Object.assign({}, proof, { size: 1024001 });
  const r3 = await sw.evaluate(([tabId, pilgrims, big]) => new Promise(res =>
    chrome.tabs.sendMessage(tabId, { action: 'FILL_SENIOR', data: { pilgrims, contact: {}, proof: big } }, res)),
    [await sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://ttdevasthanams.ap.gov.in/*' })).pop().id), PILGRIMS.slice(0, 2), big]);
  ok(r3 && r3.proofState === 'too_big', 'a proof over 1,024,000 bytes is not attached -> "too_big"', r3 && r3.proofState);
  const young = [Object.assign({}, PILGRIMS[0], { age: '60' })];
  const r4 = await sw.evaluate(([tabId, pilgrims, proof]) => new Promise(res =>
    chrome.tabs.sendMessage(tabId, { action: 'FILL_SENIOR', data: { pilgrims, contact: {}, proof } }, res)),
    [await sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://ttdevasthanams.ap.gov.in/*' })).pop().id), young, proof]);
  ok(r4 && (r4.warnings || []).some(w => /65 or older/.test(w)), 'a first pilgrim under 65 is warned about', r4 && r4.warnings);
  await page.close();

  G('Other TTD pages are unaffected');
  page = await ctx.newPage();
  await page.goto('https://ttdevasthanams.ap.gov.in/darshan/pilgrim-details');
  await page.waitForSelector('#ttdfh-fill-button', { timeout: 8000 }).catch(() => {});
  ok(/Fill Pilgrims/.test(await page.evaluate(() => (document.getElementById('ttdfh-pop-title') || {}).textContent || '')), 'the same form outside /pld/ is still "Fill Pilgrims"');
  await page.close();

  G('Side panel: Senior Citizen tab');
  await seed({ pilgrims: PILGRIMS.slice(0, 2).map((p, i) => i === 0 ? Object.assign({}, p, { age: '64' }) : p) });
  page = await ctx.newPage();
  page.on('pageerror', e => { fail++; console.log('  FAIL  panel error: ' + e.message); });
  await page.goto('chrome-extension://' + extId + '/popup/index.html');
  await page.click('.tab-btn:has-text("Senior Citizen")');
  await page.waitForSelector('[data-senior-proof]');
  const issues = await page.textContent('[data-senior-issues]');
  ok(/64/.test(issues) && /65 or older/.test(issues) && /No age proof saved/.test(issues), 'issue list: under-65 senior and no proof', issues);
  ok(/senior citizen/.test(await page.textContent('.pilgrims-section')) && /spouse/.test(await page.textContent('.pilgrims-section')), 'roles shown: senior citizen, spouse');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tfhp-'));
  const good = path.join(tmp, 'aadhaar.pdf'); fs.writeFileSync(good, pdf);
  const bad = path.join(tmp, 'renamed.pdf'); fs.writeFileSync(bad, Buffer.from('PK\x03\x04 docx'));
  const huge = path.join(tmp, 'huge.pdf'); fs.writeFileSync(huge, Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(1024000, 0x20)]));
  await page.setInputFiles('[data-senior-file]', bad);
  await page.waitForTimeout(400);
  ok(!(await sw.evaluate(async () => (await chrome.storage.local.get('seniorProof')).seniorProof)), 'a renamed non-PDF is refused');
  await page.setInputFiles('[data-senior-file]', huge);
  await page.waitForTimeout(400);
  ok(!(await sw.evaluate(async () => (await chrome.storage.local.get('seniorProof')).seniorProof)), 'a file over 1 MB is refused');
  await page.setInputFiles('[data-senior-file]', good);
  await page.waitForSelector('[data-senior-proof="saved"]', { timeout: 5000 }).catch(() => {});
  const stored = await sw.evaluate(async () => (await chrome.storage.local.get('seniorProof')).seniorProof);
  ok(stored && stored.name === 'aadhaar.pdf' && stored.type === 'application/pdf' && stored.size === pdf.length &&
     Buffer.from(stored.data.split(',')[1], 'base64').equals(pdf), 'a valid PDF is stored byte-for-byte', stored && { n: stored.name, t: stored.type, s: stored.size });
  ok(/aadhaar\.pdf/.test(await page.textContent('[data-senior-proof]')), 'and shown as saved');
  await page.click('button:has-text("Remove")');
  await page.waitForSelector('[data-senior-proof="none"]', { timeout: 5000 }).catch(() => {});
  ok(!(await sw.evaluate(async () => (await chrome.storage.local.get('seniorProof')).seniorProof)), 'Remove deletes it');
  await page.close();

  G('Encrypted at rest: the proof is a sensitive key');
  // import() is not allowed in a service worker, so ask an extension page.
  const ep = await ctx.newPage();
  await ep.goto('chrome-extension://' + extId + '/popup/index.html');
  const sens = await ep.evaluate(async () => (await import('/shared/secureStore.js')).SENSITIVE_KEYS).catch(e => String(e));
  const bgKeys = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8').match(/const ALLOWED_KEYS = (\[[^\]]*\])/);
  await ep.close();
  ok(Array.isArray(sens) && sens.includes('seniorProof'), 'seniorProof is in SENSITIVE_KEYS', sens);
  ok(bgKeys && JSON.parse(bgKeys[1]).includes('seniorProof'), 'and the background worker may hand it (decrypted) to the TTD page', bgKeys && bgKeys[1]);

  await ctx.close();
  console.log('\nsenior-citizen: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
