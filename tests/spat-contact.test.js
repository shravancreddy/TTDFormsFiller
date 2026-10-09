#!/usr/bin/env node
/*
 * General Details on the darshan pilgrim-details step (/spat/pilgrim-details)
 * — loads the UNPACKED extension into Chromium and fills a stand-in that copies
 * how TTD's form keeps its contact state.
 *
 *   REACT_UMD_DIR=/path/to/node_modules NODE_PATH=$(npm root -g) node tests/spat-contact.test.js
 *
 * REACT_UMD_DIR must hold react@18 and react-dom@18 (their umd/ builds).
 *
 * What the stand-in copies from the site (chunk 9803, module 99803, rendered by
 * pages/spat/[section] for "pilgrim-details"; TTD/AufoFillFailing.zip, Oct 2026):
 *   - pilgrim rows: input[name=fname] / [name=age] / [name=idProofNumber], id = row
 *     index; the handler copies the array but mutates the row object in place.
 *   - General Details: emailId / city / pincode handlers do
 *       setContact({ ...contactFromLastRender, [name]: value })
 *     while state / country use the functional form. So writes made in one task
 *     overwrite each other: only what the last stale write carried survives.
 *   - pincode onBlur validates contactFromLastRender.pincode, not the input, and
 *     leaves "Please enter valid pincode" if that is not 6 digits.
 *   - Continue: any empty contact key -> "Please enter the <key>", plus any error
 *     already showing, blocks the step.
 * Gender / Photo ID Proof are custom dropdowns shared with every other flow and
 * are left out.
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
const setDom = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
  el._valueTracker && el._valueTracker.setValue(v); };
// Module 20238, reduced: untrusted onChange puts React's value back and stops;
// the dropdown opens, and an option is taken, only on a trusted click.
function Field(p) {
  const [open, setOpen] = React.useState(false);
  const box = React.useRef();
  React.useEffect(() => { const h = ev => { box.current && !box.current.contains(ev.target) && setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [box]);
  const onChange = ev => { if (!(ev && ev.nativeEvent && ev.nativeEvent.isTrusted)) { setDom(ev.target, p.value || ''); return; }
    p.onChange && p.onChange(ev); };
  return e('div', { style: { position: 'relative' } },
    e('input', { value: p.value || '', onChange, name: p.name, id: p.id, type: p.type || 'text', maxLength: p.maxLength,
      readOnly: !!p.list, onBlur: ev => p.onBlur && p.onBlur(ev),
      onClick: ev => { ev.nativeEvent && ev.nativeEvent.isTrusted && p.list && setOpen(true); } }),
    p.list && e('div', { ref: box }, open && e('div', { className: 'dropdown_scroll' },
      e('ul', { style: { listStyleType: 'none' } }, p.list.map(it => e('li', { key: it,
        onClick: ev => { if (ev.nativeEvent && ev.nativeEvent.isTrusted) { p.selectedItem(it); setOpen(false); } } }, it))))));
}
function App() {
  const blank = () => ({ fname: '', age: '', gender: '', photoIdType: '', idProofNumber: '' });
  const [rows, setRows] = React.useState([blank(), blank()]);
  const [c, setC] = React.useState({ emailId: '', city: '', state: '', country: '', pincode: '' });
  const [err, setErr] = React.useState({});
  const [verdict, setVerdict] = React.useState('');
  window.__rows = rows; window.__contact = c; window.__err = err; window.__verdict = verdict;
  // i6 / i7 / te: copy the array, mutate the row object in place.
  const onRow = ev => { const t = ev.target; const o = rows.slice(); o[t.id][t.name] = t.value; setRows(o); };
  const pick = (i, k) => it => { const o = rows.slice(); o[i][k] = it; setRows(o); };
  // tO / i5 / i9: a spread of the contact object from the last render.
  const stale = re => ev => { const t = ev.target; if (re && !re.test(t.value)) return ev.preventDefault();
    setErr(Object.assign({}, err, { [t.name]: '' })); setC(Object.assign({}, c, { [t.name]: t.value })); };
  // tR (state / country): functional update.
  const fresh = ev => { const t = ev.target; if (!/^[a-zA-Z ]*$/.test(t.value)) return ev.preventDefault();
    setC(p => Object.assign({}, p, { [t.name]: t.value })); };
  // ta: checks the contact object from the last render, not the input.
  const pinBlur = ev => { if (!ev.target.value) return setErr(Object.assign({}, err, { pincode: 'Please enter the pincode' }));
    setErr(Object.assign({}, err, { pincode: /^[1-9][0-9]{5}$/.test(c.pincode) ? '' : 'Please enter valid pincode' })); };
  const cont = () => { const x = Object.assign({}, err);
    Object.keys(c).forEach(k => { if (!c[k]) x[k] = 'Please enter the ' + k; });
    rows.forEach((r, i) => Object.keys(r).forEach(k => { if (!r[k]) x[k + i] = k + ' cannot be empty'; }));
    setErr(x); setVerdict(Object.values(x).some(v => v) ? 'blocked' : 'ok'); };
  const cf = (name, onChange, extra) => e(Field, Object.assign({ name, id: 0, value: c[name], onChange }, extra || {}));
  return e('div', null,
    rows.map((r, i) => e('div', { key: i, className: 'row' },
      e(Field, { name: 'fname', id: i, value: r.fname, onChange: onRow }),
      e(Field, { name: 'age', id: i, type: 'number', value: r.age, onChange: onRow }),
      e(Field, { name: 'gender', id: i, value: r.gender, list: ['Male', 'Female', 'Transgender'], selectedItem: pick(i, 'gender') }),
      e(Field, { name: 'photoIdType', id: i, value: r.photoIdType, list: ['Aadhaar Card', 'Passport', 'Voter ID'], selectedItem: pick(i, 'photoIdType') }),
      e(Field, { name: 'idProofNumber', id: i, value: r.idProofNumber, onChange: onRow, maxLength: 12 }))),
    e('div', { id: 'generalDetailsError' },
      cf('emailId', stale()), cf('city', stale(/^[a-zA-Z ]*$/)), cf('state', fresh), cf('country', fresh)),
    cf('pincode', stale(/^[0-9 ]*$/), { onBlur: pinBlur, maxLength: 6 }),
    e('button', { id: 'cont', onClick: cont }, 'Continue'));
}
ReactDOM.createRoot(document.getElementById('root')).render(e(App));
</script></body></html>`;

const PILGRIMS = [
  { id: 'a', name: 'Ramaiah Sastry', age: '46', gender: 'Male', idProof: 'Aadhaar Card', idNumber: '999988887777',
    email: 'who@example.com', city: 'Hyderabad', state: 'Telangana', country: 'India', pincode: '500068' },
  { id: 'b', name: 'Kamala Sastry', age: '42', gender: 'Female', idProof: 'Aadhaar Card', idNumber: '888877776666' }
];
const CONTACT = { email: 'who@example.com', city: 'Hyderabad', state: 'Telangana', country: 'India', pincode: '500068' };
const WANT = { emailId: 'who@example.com', city: 'Hyderabad', state: 'Telangana', country: 'India', pincode: '500068' };

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

  await ctx.route('https://ttdevasthanams.ap.gov.in/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
  const seed = (items) => sw.evaluate(async (items) => { await chrome.storage.local.clear(); await chrome.storage.local.set(items); }, items);
  const URL = 'https://ttdevasthanams.ap.gov.in/spat/pilgrim-details?flow=spat&flowIdentifier=spat&section=slot-booking';
  const open = async () => {
    const page = await ctx.newPage();
    page.on('pageerror', e => { fail++; console.log('  FAIL  page error: ' + e.message); });
    await page.goto(URL);
    await page.waitForSelector('#ttdfh-fill-button', { timeout: 8000 }).catch(() => {});
    return page;
  };
  const state = page => page.evaluate(() => ({ rows: window.__rows, c: window.__contact, err: window.__err }));
  const pressContinue = async page => {
    await page.click('#cont');
    await page.waitForFunction(() => window.__verdict, null, { timeout: 3000 }).catch(() => {});
    return page.evaluate(() => ({ verdict: window.__verdict, err: window.__err }));
  };
  const errors = err => Object.values(err || {}).filter(Boolean);

  G('Popup "Fill all" (FILL_ALL) on /spat/pilgrim-details');
  await seed({ pilgrims: PILGRIMS, contact: CONTACT });
  let page = await open();
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://ttdevasthanams.ap.gov.in/*' })).pop().id);
  const resp = await sw.evaluate(([tabId, pilgrims, contact]) => new Promise(res =>
    chrome.tabs.sendMessage(tabId, { action: 'FILL_ALL', data: { pilgrims, contact } }, res)), [tabId, PILGRIMS, CONTACT]);
  ok(resp && resp.status === 'success' && resp.filled === 2, 'responds filled=2', resp);
  let s = await state(page);
  ok(s.rows[0].fname === 'Ramaiah Sastry' && s.rows[1].fname === 'Kamala Sastry' && s.rows[1].age === '42' &&
     s.rows[0].idProofNumber === '999988887777' && s.rows[1].idProofNumber === '888877776666', 'typed pilgrim fields reach React state', s.rows);
  ok(s.rows[0].gender === 'Male' && s.rows[1].gender === 'Female' && s.rows[0].photoIdType === 'Aadhaar Card' &&
     s.rows[1].photoIdType === 'Aadhaar Card', 'Gender and Photo ID Proof picked from their dropdowns', s.rows);
  ok(JSON.stringify(s.c) === JSON.stringify(WANT), 'every General Details field reaches React state (none wiped by a later write)', s.c);
  ok(errors(s.err).length === 0, 'no stale validation error is left showing (pincode onBlur)', s.err);
  let v = await pressContinue(page);
  ok(v.verdict === 'ok', 'Continue passes the site\'s check: nothing reported blank', v);
  await page.close();

  G('On-page Fill button on /spat/pilgrim-details');
  page = await open();
  ok(!!(await page.$('#ttdfh-fill-button')), 'the floating Fill button appears');
  await page.click('#ttdfh-fill-button');
  await page.waitForFunction(() => window.__contact && window.__contact.pincode && window.__rows[1].idProofNumber, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  s = await state(page);
  ok(JSON.stringify(s.c) === JSON.stringify(WANT), 'every General Details field reaches React state', s.c);
  ok(s.rows[1].fname === 'Kamala Sastry' && s.rows[1].gender === 'Female', 'and both pilgrim rows', s.rows);
  v = await pressContinue(page);
  ok(v.verdict === 'ok', 'Continue passes', v);
  await page.close();

  await ctx.close();
  console.log('\nspat-contact: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
