#!/usr/bin/env node
/*
 * Every booking flow that renders TTD's shared pilgrim-row component (chunk
 * 2289) plus the Srivari Seva sevak form — loads the UNPACKED extension into
 * Chromium and fills stand-ins copied from the live site's build a341e02f
 * (Oct 2026; TTD/ttdevasthanams.ap.gov.in_1.zip and the build's own chunks).
 *
 *   REACT_UMD_DIR=/path/to/node_modules NODE_PATH=$(npm root -g) node tests/seva-flows.test.js
 *
 * REACT_UMD_DIR must hold react@18 and react-dom@18 (their umd/ builds).
 *
 * Copied from the site:
 *   - module 20238 (the shared field, also inlined in several pages): untrusted
 *     onChange writes React's value back and stops; the dropdown opens, and an
 *     option is taken, only on a trusted click.
 *   - chunk 2289 (pilgrim rows: Arjitha Seva incl. Homam, Angapradakshinam,
 *     Senior Citizen / Differently Abled, APD, Infant, Virtual Seva): name / age /
 *     gender / idType / idNumber; Photo ID Proof is disabled until the age is in
 *     state, Photo ID Number until the ID type is.
 *   - the page's row handler `setPilgrims(pilgrims.map(...))` over the list from
 *     the LAST render, and its row onBlur `ec`, which reads that list:
 *     "This field is required" if the field is empty there.
 *   - General Details: gothram (letters only), pilgrimEmail / City / State /
 *     Country / Pincode; the onBlur `es` reads the contact object from the last
 *     render.
 *   - Srivari Seva sevak form: handler `ip` saves `{ ...sevakFromLastRender,
 *     [name]: value }`; onBlur `iw` reads that copy.
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

// Module 20238, reduced.
const FIELD = `
const e = React.createElement;
const setDom = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
  el._valueTracker && el._valueTracker.setValue(v); };
function Field(p) {
  const [open, setOpen] = React.useState(false);
  const box = React.useRef();
  React.useEffect(() => { const h = ev => { box.current && !box.current.contains(ev.target) && setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [box]);
  const onChange = ev => { if (!(ev && ev.nativeEvent && ev.nativeEvent.isTrusted)) { setDom(ev.target, p.value || ''); return; }
    p.onChange && p.onChange(ev); };
  return e('div', { style: { position: 'relative' } },
    e('input', { value: p.value || '', onChange, name: p.name, type: p.type || 'text', maxLength: p.maxLength,
      readOnly: !!p.list, disabled: !!p.disabled, onBlur: ev => p.onBlur && p.onBlur(ev),
      onClick: ev => { ev.nativeEvent && ev.nativeEvent.isTrusted && p.list && setOpen(true); } }),
    p.error ? e('span', { className: 'err' }, p.error) : null,
    p.list && e('div', { ref: box }, open && e('div', { className: 'dropdown_scroll' },
      e('ul', { style: { listStyleType: 'none' } }, p.list.map(it => e('li', { key: it.id,
        onClick: ev => { if (ev.nativeEvent && ev.nativeEvent.isTrusted) { p.selectedItem(it); setOpen(false); } } }, it.title))))));
}
`;

const SEVA_PAGE = `<!doctype html><html><body><div id="root"></div>
<script>${REACT}</script><script>${REACT_DOM}</script>
<script>${FIELD}
const GENDERS = [{ id: 'Male', title: 'Male' }, { id: 'Female', title: 'Female' }, { id: 'Transgender', title: 'Transgender' }];
const IDS = [{ id: 'aadhaar', title: 'Aadhaar Card' }, { id: 'passport', title: 'Passport' }];
function App() {
  const blank = id => ({ id, name: '', age: '', gender: '', idType: '', idNumber: '' });
  const [J, K] = React.useState([blank(0), blank(1)]);
  const [U, G] = React.useState({ gothram: '', pilgrimEmail: '', pilgrimCity: '', pilgrimState: '', pilgrimCountry: '', pilgrimPincode: '' });
  const [ee, et] = React.useState({});
  const [verdict, setVerdict] = React.useState('');
  window.__rows = J; window.__contact = U; window.__err = ee; window.__verdict = verdict;
  // ea: rebuilds the list from the last render.
  const ea = (ev, t, kind, isDrop, item, field) => {
    const name = isDrop ? field : ev.target.name; let v = isDrop ? item.id : ev.target.value; let okv = true;
    if (!isDrop && v && kind === 'number') okv = /^[0-9]+$/.test(v);
    if (!isDrop && v && kind === 'textWithSpace') okv = /^[a-z A-Z]+$/.test(v);
    K(J.map(r => okv && r.id === t ? Object.assign({}, r, { [name]: v }) : r));
  };
  // ec: row onBlur, reads the list from the last render.
  const ec = (name, msg, i) => { if (!J[i][name]) return et(x => Object.assign({}, x, { [name + '-' + i]: 'This field is required' }));
    et(x => Object.assign({}, x, { [name + '-' + i]: '' })); };
  // eo: functional update; es: contact onBlur, reads the object from the last render.
  const eo = (ev, kind) => { const n = ev.target.name, v = ev.target.value; let okv = true;
    if (v && kind === 'text') okv = /^[a-zA-Z]+$/.test(v); if (v && kind === 'number') okv = /^[0-9]+$/.test(v);
    if (v && kind === 'textWithSpace') okv = /^[a-z A-Z]+$/.test(v); okv && G(p => Object.assign({}, p, { [n]: v })); };
  const es = n => () => et(x => Object.assign({}, x, { [n]: U[n] ? '' : 'This field is required' }));
  const cont = () => { const x = Object.assign({}, ee);
    J.forEach((r, i) => ['name', 'age', 'gender', 'idType', 'idNumber'].forEach(k => { if (!r[k]) x[k + '-' + i] = 'This field is required'; }));
    Object.keys(U).forEach(k => { if (!U[k]) x[k] = 'This field is required'; });
    et(x); setVerdict(Object.values(x).some(Boolean) ? 'blocked' : 'ok'); };
  const title = (list, id) => (list.find(o => o.id === id) || {}).title || '';
  const c = (name, kind) => e(Field, { name, value: U[name], error: ee[name], onChange: ev => eo(ev, kind), onBlur: es(name) });
  return e('div', null,
    J.map((r, i) => e('div', { key: i, className: 'row' },
      e(Field, { name: 'name', value: r.name, error: ee['name-' + i], onChange: ev => ea(ev, i, 'textWithSpace'), onBlur: ev => ec('name', '', i) }),
      e(Field, { name: 'age', type: 'tel', maxLength: 3, value: r.age, error: ee['age-' + i], onChange: ev => ea(ev, i, 'number'), onBlur: () => ec('age', '', i) }),
      e(Field, { name: 'gender', value: title(GENDERS, r.gender), list: GENDERS, selectedItem: it => ea('', i, '', true, it, 'gender') }),
      e(Field, { name: 'idType', value: title(IDS, r.idType), list: IDS, disabled: !r.age, selectedItem: it => ea('', i, '', true, it, 'idType') }),
      e(Field, { name: 'idNumber', value: r.idNumber, maxLength: 12, disabled: !r.idType, error: ee['idNumber-' + i],
        onChange: ev => ea(ev, i, 'number'), onBlur: ev => ec('idNumber', '', i) }))),
    c('gothram', 'text'), c('pilgrimEmail', 'textSpecial'), c('pilgrimCity', 'textWithSpace'),
    c('pilgrimState', 'textWithSpace'), c('pilgrimCountry', 'textWithSpace'), c('pilgrimPincode', 'number'),
    e('button', { id: 'cont', onClick: cont }, 'Continue'));
}
ReactDOM.createRoot(document.getElementById('root')).render(e(App));
</script></body></html>`;

const SEVAK_FIELDS = ['sevakName', 'fatherOrSpouseName', 'age', 'mobileNo', 'altMobileNo', 'emailId', 'residentialAdrs', 'pincode'];
const SEVAK_PAGE = `<!doctype html><html><body><div id="root"></div>
<script>${REACT}</script><script>${REACT_DOM}</script>
<script>${FIELD}
const NAMES = ${JSON.stringify(SEVAK_FIELDS)};
function App() {
  const [it, io] = React.useState(Object.fromEntries(NAMES.map(n => [n, ''])));
  const [eg, eh] = React.useState({});
  window.__sevak = it; window.__err = eg;
  // ip: a spread of the sevak object from the last render.
  const ip = ev => { const d = Object.assign({}, it); d[ev.target.name] = ev.target.value; io(d); };
  // iw: reads the sevak object from the last render.
  const iw = n => () => { const x = Object.assign({}, eg); x[n] = it[n] ? '' : 'This field is required'; eh(x); };
  return e('div', { className: 'profile_sevakContainer__APYsI' },
    NAMES.map(n => e(Field, { key: n, name: n, value: it[n], error: eg[n], onChange: ip, onBlur: iw(n) })));
}
ReactDOM.createRoot(document.getElementById('root')).render(e(App));
</script></body></html>`;

const PILGRIMS = [
  { id: 'a', name: 'Ramaiah Sastry', age: '66', gender: 'Male', idProof: 'Aadhaar Card', idNumber: '999988887777',
    email: 'who@example.com', city: 'Hyderabad', state: 'Telangana', country: 'India', pincode: '500068', gothram: 'Kashyapa' },
  { id: 'b', name: 'Kamala Sastry', age: '62', gender: 'Female', idProof: 'Aadhaar Card', idNumber: '888877776666' }
];
const CONTACT = { email: 'who@example.com', city: 'Hyderabad', state: 'Telangana', country: 'India', pincode: '500068', gothram: 'Kashyapa' };
const WANT_CONTACT = { gothram: 'Kashyapa', pilgrimEmail: 'who@example.com', pilgrimCity: 'Hyderabad', pilgrimState: 'Telangana',
  pilgrimCountry: 'India', pilgrimPincode: '500068' };
const WANT_ROWS = [
  { id: 0, name: 'Ramaiah Sastry', age: '66', gender: 'Male', idType: 'aadhaar', idNumber: '999988887777' },
  { id: 1, name: 'Kamala Sastry', age: '62', gender: 'Female', idType: 'aadhaar', idNumber: '888877776666' }
];
const SEVAK = { sevakName: 'Ramaiah Sastry', fatherOrSpouseName: 'Venkata Sastry', age: '45', mobileNo: '9876543210',
  altMobileNo: '9876501234', email: 'who@example.com', residentialAdrs: '1 Temple Street', pincode: '500068', idType: 'Aadhaar Card' };

// Every flow that renders chunk 2289 at its pilgrim-details step.
const FLOWS = [
  ['Arjitha Seva (incl. Sri Srinivasa Divyanugraha Homam)', '/arjitha-seva/pilgrim-details?section=slot-booking&flowIdentifier=arjitha-seva&flow=arjitha-seva', 'FILL_ALL'],
  ['Angapradakshinam', '/agp/pilgrim-details?flow=agp&flowIdentifier=agp&section=slot-booking', 'FILL_ALL'],
  ['Senior Citizen / Differently Abled', '/pld/pilgrim-details?section=slot-booking&flow=pld&flowIdentifier=pld', 'FILL_SENIOR'],
  ['APD', '/apd/pilgrim-details?flow=apd&flowIdentifier=apd&section=slot-booking', 'FILL_ALL'],
  ['Infant darshan', '/infant-darshan/pilgrim-details?flow=infant-darshan&section=slot-booking', 'FILL_ALL'],
  ['Virtual Seva', '/virtual-seva/pilgrim-details?flow=virtual-seva&section=slot-booking', 'FILL_ALL']
];

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tfh-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: CHROME, headless: true,
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT]
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  for (let i = 0; i < 50 && !(await sw.evaluate(() => !!(self.chrome && chrome.storage))); i++) await new Promise(r => setTimeout(r, 100));
  ok(!!sw.url(), 'extension loaded (service worker up)', sw.url());

  await ctx.route('https://ttdevasthanams.ap.gov.in/**', r => r.fulfill({ status: 200, contentType: 'text/html',
    body: /srivari-seva/.test(r.request().url()) ? SEVAK_PAGE : SEVA_PAGE }));
  await sw.evaluate(async (items) => { await chrome.storage.local.clear(); await chrome.storage.local.set(items); },
    { pilgrims: PILGRIMS, contact: CONTACT });
  const open = async (url) => {
    const page = await ctx.newPage();
    page.on('pageerror', e => { fail++; console.log('  FAIL  page error: ' + e.message); });
    await page.goto('https://ttdevasthanams.ap.gov.in' + url);
    await page.waitForSelector('#ttdfh-fill-button', { timeout: 8000 }).catch(() => {});
    return page;
  };
  const send = (action, data) => sw.evaluate(async ([action, data]) => {
    const tab = (await chrome.tabs.query({ url: 'https://ttdevasthanams.ap.gov.in/*' })).pop();
    return new Promise(res => chrome.tabs.sendMessage(tab.id, { action, data }, res));
  }, [action, data]);
  const shown = errs => Object.entries(errs || {}).filter(([, v]) => v);

  for (const [label, url, action] of FLOWS) {
    G(label + ' — ' + url.split('?')[0]);
    const page = await open(url);
    const resp = await send(action, { pilgrims: PILGRIMS, contact: CONTACT });
    ok(resp && resp.status === 'success' && resp.filled === 2, 'responds filled=2', resp && { s: resp.status, f: resp.filled, m: resp.message });
    const s = await page.evaluate(() => ({ rows: window.__rows, c: window.__contact, err: window.__err }));
    ok(JSON.stringify(s.rows) === JSON.stringify(WANT_ROWS), 'both rows in React state: name, age, gender, ID type, ID number', s.rows);
    ok(JSON.stringify(s.c) === JSON.stringify(WANT_CONTACT), 'gothram and General Details in React state', s.c);
    ok(shown(s.err).length === 0, 'no "This field is required" left under a filled field', shown(s.err));
    await page.click('#cont');
    await page.waitForFunction(() => window.__verdict, null, { timeout: 3000 }).catch(() => {});
    const v = await page.evaluate(() => ({ verdict: window.__verdict, err: window.__err }));
    ok(v.verdict === 'ok', 'Continue passes the page\'s own check', { verdict: v.verdict, err: shown(v.err) });
    await page.close();
  }

  G('Srivari Seva sevak form — values written back to back');
  const page = await open('/srivari-seva/profile?flow=srivari-seva');
  const resp = await send('FILL_SEVA', { sevakData: SEVAK });
  ok(resp && resp.status === 'success', 'FILL_SEVA responds success', resp);
  await page.waitForTimeout(300);
  const s = await page.evaluate(() => ({ v: window.__sevak, err: window.__err }));
  const want = { sevakName: SEVAK.sevakName, fatherOrSpouseName: SEVAK.fatherOrSpouseName, age: SEVAK.age, mobileNo: SEVAK.mobileNo,
    altMobileNo: SEVAK.altMobileNo, emailId: SEVAK.email, residentialAdrs: SEVAK.residentialAdrs, pincode: SEVAK.pincode };
  ok(JSON.stringify(s.v) === JSON.stringify(want), 'every sevak field in React state (none wiped by the next write)', s.v);
  ok(shown(s.err).length === 0, 'no "This field is required" left under a filled field', shown(s.err));
  await page.close();

  await ctx.close();
  console.log('\nseva-flows: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
