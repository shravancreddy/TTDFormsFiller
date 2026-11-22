#!/usr/bin/env node
/*
 * The passport / visa popup on the Arjitha Seva pilgrim-details step, build
 * a341e02f (Oct 2026), read out of Passport_Arjita_Seva_Reference.zip
 * (22 Nov 2026; chunks 0j-q3xmixx1xr, 2cb82321011sz and 2i64qb7th9590):
 *   - choosing Passport opens a modal ("Photo ID Proof Instructions") whose
 *     CSS-module classes are ZWYkFG_*: the old passportVisaPopup_* are gone;
 *   - its Passport Number / Country / Visa / Type of Visa are the shared
 *     guarded text field; Visa Validity Date is a READ-ONLY MUI field that
 *     opens a calendar (module 69899 "os", onChange(Date) -> DD/MM/YYYY);
 *   - Submit stays disabled until every rule holds, then hands the passport
 *     number (as idNumber) and visa details back to the row;
 *   - the live page has header menus: visible <ul>s of <li>s.
 * Loads content/page-bridge.js and content/autofill.js straight into the
 * stand-in (chrome.* stubbed) and runs FILL_ALL, so no unpacked-extension
 * launch is needed.
 *
 *   NODE_PATH=/path/to/node_modules CHROMIUM_PATH=/path/to/chrome node tests/passport-popup.test.js
 *
 * NODE_PATH must hold playwright (or playwright-core), react@18 and react-dom@18.
 * The stand-in is shared with Clean on Arrive's check-contact-fill.mjs.
 */
'use strict';
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('playwright-core')); }

const EXT = path.resolve(__dirname, '..', 'ttd-form-helper');
const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const pkgDir = (name) => path.dirname(require.resolve(name + '/package.json'));
const REACT = fs.readFileSync(path.join(pkgDir('react'), 'umd/react.production.min.js'), 'utf8');
const REACT_DOM = fs.readFileSync(path.join(pkgDir('react-dom'), 'umd/react-dom.production.min.js'), 'utf8');

let pass = 0, fail = 0;
const G = t => console.log('\n' + t);
function ok(cond, label, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

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
const APP = `
const GENDERS = [{ id: 'Male', title: 'Male' }, { id: 'Female', title: 'Female' }, { id: 'Transgender', title: 'Transgender' }];
const IDS = [{ id: 'aadhaar', title: 'Aadhaar Card' }, { id: 'passport', title: 'Passport' }];
const STATES = ['Andhra Pradesh', 'Karnataka', 'Odisha', 'Tamil Nadu', 'Telangana'].map(t => ({ id: t, title: t }));
// The passport popup (build a341e02f, chunk 2cb82321011sz): guarded text
// fields, a READ-ONLY date component that takes onChange(Date) (module 69899
// os), and a Submit that stays disabled until every rule holds.
function DateField(p) {
  return e('div', { style: { position: 'relative' } },
    e('input', { name: p.name, readOnly: true, value: p.value || '', onClick: () => {} }));
}
function PassportPopup({ onContinue, defaultValues }) {
  const [x, setX] = React.useState(Object.assign({ passportNumber: '', country: '', visaNumber: '', visaType: '', visaValidityDate: '' }, defaultValues));
  const b = ev => { const { name, value } = ev.target; setX(o => Object.assign({}, o, { [name]: value })); };
  const fmt = d => ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
  const N = /^[A-Za-z0-9]{7,10}$/.test(x.passportNumber) && /^[A-Za-z ]{3,60}$/.test(x.country.trim())
    && /^[A-Za-z0-9]{3,30}$/.test(x.visaNumber.trim()) && /^[A-Za-z0-9-]{3,30}$/.test(x.visaType.trim())
    && /^[0-9]{2}[/][0-9]{2}[/][0-9]{4}$/.test(x.visaValidityDate);
  window.__popup = x;
  return e('div', { className: 'ZWYkFG_contentWrapper', role: 'dialog' },
    e('div', { className: 'ZWYkFG_innerContainer' },
      e('ol', null, e('li', null, 'Carry your passport')),
      ['passportNumber', 'country', 'visaNumber', 'visaType'].map(n => e(Field, { key: n, name: n, value: x[n], onChange: b })),
      e(DateField, { name: 'visaValidityDate', format: 'dd/MM/yyyy', value: x.visaValidityDate, keyboard: true,
        onChange: d => setX(o => Object.assign({}, o, { visaValidityDate: d ? fmt(d) : '' })) })),
    e('div', { className: 'ZWYkFG_buttonRow' },
      e('button', { className: 'ZWYkFG_continueBtn', disabled: !N, onClick: () => { if (N) { const { passportNumber, ...rest } = x; onContinue(Object.assign({}, rest, { idNumber: passportNumber })); } } }, 'Submit')));
}
function App() {
  const blank = id => ({ id, name: '', age: '', gender: '', idType: '', idNumber: '', country: '', visaNumber: '', visaType: '', visaValidityDate: '' });
  const [pp, setPp] = React.useState(-1);
  const [J, K] = React.useState([blank(0), blank(1)]);
  const [U, G] = React.useState({ pilgrimEmail: '', pilgrimCity: '', pilgrimState: '', pilgrimCountry: '', pilgrimPincode: '' });
  const [ee, et] = React.useState({});
  window.__rows = J; window.__contact = U; window.__err = ee;
  const ea = (ev, t, kind, isDrop, item, field) => {
    const name = isDrop ? field : ev.target.name; let v = isDrop ? item.id : ev.target.value; let okv = true;
    if (!isDrop && v && kind === 'number') okv = /^[0-9]+$/.test(v);
    if (!isDrop && v && kind === 'textWithSpace') okv = /^[a-z A-Z]+$/.test(v);
    K(J.map(r => okv && r.id === t ? Object.assign({}, r, { [name]: v }) : r));
  };
  const ec = (name, i) => { if (!J[i][name]) return et(x => Object.assign({}, x, { [name + '-' + i]: 'This field is required' }));
    et(x => Object.assign({}, x, { [name + '-' + i]: '' })); };
  const eo = (ev, kind) => { const n = ev.target.name, v = ev.target.value; let okv = true;
    if (v && kind === 'number') okv = /^[0-9]+$/.test(v);
    if (v && kind === 'textWithSpace') okv = /^[a-z A-Z]+$/.test(v); okv && G(p => Object.assign({}, p, { [n]: v })); };
  const es = n => () => et(x => Object.assign({}, x, { [n]: U[n] ? '' : 'This field is required' }));
  const title = (list, id) => (list.find(o => o.id === id) || {}).title || '';
  const c = (name, kind) => e(Field, { name, value: U[name], error: ee[name], onChange: ev => eo(ev, kind), onBlur: es(name) });
  return e('div', null,
    J.map((r, i) => e('div', { key: i, className: 'row' },
      e(Field, { name: 'name', value: r.name, error: ee['name-' + i], onChange: ev => ea(ev, i, 'textWithSpace'), onBlur: () => ec('name', i) }),
      e(Field, { name: 'age', type: 'tel', maxLength: 3, value: r.age, error: ee['age-' + i], onChange: ev => ea(ev, i, 'number'), onBlur: () => ec('age', i) }),
      e(Field, { name: 'gender', value: title(GENDERS, r.gender), list: GENDERS, selectedItem: it => ea('', i, '', true, it, 'gender') }),
      e(Field, { name: 'idType', value: title(IDS, r.idType), list: IDS, disabled: !r.age, selectedItem: it => { ea('', i, '', true, it, 'idType'); it.title === 'Passport' && setPp(i); } }),
      e(Field, { name: 'idNumber', value: r.idNumber, maxLength: 12, disabled: !r.idType, error: ee['idNumber-' + i],
        onChange: ev => ea(ev, i, 'textWithNumber'), onBlur: () => ec('idNumber', i) }),
      r.idType === 'passport' && ['country', 'visaNumber', 'visaType', 'visaValidityDate'].map(n =>
        e(Field, { key: n, name: n, value: r[n], onChange: ev => K(L => L.map(q => q.id === i ? Object.assign({}, q, { [n]: ev.target.value }) : q)) })))),
    pp >= 0 && e('div', { className: 'modal' }, e('h3', null, 'Photo ID Proof Instructions'),
      e(PassportPopup, { defaultValues: { passportNumber: J[pp].idNumber }, onContinue: v => { const at = pp; setPp(-1);
        K(L => L.map(q => q.id === at ? Object.assign({}, q, v) : q)); } })),
    c('pilgrimEmail', 'textSpecial'), c('pilgrimCity', 'textWithSpace'),
    e(Field, { name: 'pilgrimState', value: U.pilgrimState, error: ee.pilgrimState, list: STATES,
      selectedItem: it => { G(p => Object.assign({}, p, { pilgrimState: it.title })); et(x => Object.assign({}, x, { pilgrimState: '' })); } }),
    c('pilgrimCountry', 'textWithSpace'), c('pilgrimPincode', 'number'),
    e('button', { id: 'cont' }, 'Continue'));
}
ReactDOM.createRoot(document.getElementById('root')).render(e(App));
`;

const PILGRIMS = [
  { name: 'Lakshmi Devi', age: '62', gender: 'Female', idProof: 'Aadhaar Card', idNumber: '123456789012' },
  { name: 'Ramana Rao', age: '66', gender: 'Male', idProof: 'Passport', idNumber: 'k1234567',
    passportCountry: 'United States', visaNumber: 'VN-12345', visaType: 'e visa', visaValidityDate: '17/05/2030' }
];
const CONTACT = { email: 'amma@example.com', city: 'Hyderabad', state: 'Telangana', country: 'India', pincode: '500001' };

const STUB = `window.chrome = {
  runtime: { id: 'ttdfh-test', onMessage: { addListener(fn) { window.__ttdfhListener = fn; } },
    sendMessage: async () => ({}), getURL: (p) => p },
  storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } },
  i18n: { getMessage: () => '' }
};`;

async function run(page, { bridge }) {
  page.on('pageerror', (err) => console.log('  page error: ' + err.message));
  await page.route('https://ttdevasthanams.ap.gov.in/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><nav><ul><li>Home</li><li>Darshan</li><li>Seva</li></ul><ul><li>Login</li></ul></nav>'
      + `<div id="root"></div><script>${REACT}</script><script>${REACT_DOM}</script><script>${FIELD}${APP}</script></body></html>`
  }));
  await page.goto('https://ttdevasthanams.ap.gov.in/arjitha-seva/pilgrim-details?section=slot-booking&flowIdentifier=arjitha-seva&flow=arjitha-seva');
  await page.waitForSelector('input[name="pilgrimEmail"]');
  if (bridge) await page.addScriptTag({ content: fs.readFileSync(path.join(EXT, 'content/page-bridge.js'), 'utf8') });
  await page.addScriptTag({ content: STUB });
  await page.addScriptTag({ content: fs.readFileSync(path.join(EXT, 'content/autofill.js'), 'utf8') });
  const reply = await page.evaluate(({ pilgrims, contact }) => new Promise((resolve) => {
    window.__ttdfhListener({ action: 'FILL_ALL', data: { pilgrims, contact } }, { id: 'ttdfh-test' }, resolve);
    setTimeout(() => resolve({ status: 'timeout' }), 40000);
  }), { pilgrims: PILGRIMS, contact: CONTACT });
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => ({ rows: window.__rows, contact: window.__contact,
    popupOpen: !!document.querySelector('input[name="passportNumber"]') }));
  return { reply, ...state };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    G('passport popup, build a341e02f (with the page bridge)');
    const page = await browser.newPage();
    const out = await run(page, { bridge: true });
    const row = (r) => [r.name, r.age, r.gender, r.idType, r.idNumber];
    ok(out.reply && out.reply.status === 'success', 'FILL_ALL answers success', out.reply);
    ok(JSON.stringify(row(out.rows[0])) === JSON.stringify(['Lakshmi Devi', '62', 'Female', 'aadhaar', '123456789012']),
      'pilgrim 1 is in React state, with header menus on the page', row(out.rows[0]));
    ok(JSON.stringify(row(out.rows[1])) === JSON.stringify(['Ramana Rao', '66', 'Male', 'passport', 'K1234567']),
      'pilgrim 2: Passport chosen, popup submitted, passport number handed back', row(out.rows[1]));
    const visa = [out.rows[1].country, out.rows[1].visaNumber, out.rows[1].visaType, out.rows[1].visaValidityDate];
    ok(JSON.stringify(visa) === JSON.stringify(['United States', 'VN12345', 'e-visa', '17/05/2030']),
      'the read-only Visa Validity Date was set, and each value cleaned to what the popup accepts', visa);
    ok(out.popupOpen === false, 'the popup is closed');
    ok(out.contact.pilgrimState === 'Telangana' && out.contact.pilgrimPincode === '500001',
      'General Details filled, State from its dropdown', out.contact);
    await page.close();
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
