#!/usr/bin/env node
/*
 * CSV import/export of saved pilgrims and sets (shared/pilgrimCsv.js).
 * Pure functions, so plain Node is enough:
 *
 *   node tests/pilgrim-csv.test.js
 *
 * The fixture copies the layout other TTD autofill tools export: "pilgrim"
 * rows with numeric gender / id_type codes and ISO dates, then "pair" rows that
 * name a set in `label` and its members in the next two columns.
 */
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

const MOD = pathToFileURL(path.resolve(__dirname, '..', 'ttd-form-helper', 'shared', 'pilgrimCsv.js')).href;

const HEADER = 'book,label,mobile,email,name,age,gender,id_type,id_number,pp_passport_no,pp_country,pp_visa_no,pp_visa_type,pp_visa_expiry,temple_match,temple_name,seva_name,seva_persons,seva_amount,wa_phone,dob';
const FIXTURE = [
  '﻿' + HEADER,
  'pilgrim,,,,Ravi Kumar,56,0,0,234567890123,,,,,,,,,,,,1970-02-15',
  'pilgrim,,,,Lakshmi  Devi,51,1,0,345678901234,,,,,,,,,,,+919876543210,',
  'pilgrim,,,,Arjun K,52,0,1,Z1234567,Z1234567,USA,V998877,OCI,2029-12-31,,,,,,,1974-08-10',
  'pilgrim,,,,Arjun K,52,0,1,Z1234567,Z1234567,USA,V998877,OCI,2029-12-31,,,,,,,1974-08-10',
  'pair,Family,Ravi Kumar,lakshmi devi,,,,,,,,,,,,,,,,,',
  'pair,Family,Ravi Kumar,Lakshmi Devi,,,,,,,,,,,,,,,,,',
  'pair,Trip,Arjun K,Nobody Here,,,,,,,,,,,,,,,,,',
  'seva,,,,,,,,,,,,,,,,,,,,',
  '',
].join('\r\n');

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
}

(async () => {
  const { importPilgrimCsv, exportPilgrimCsv, parseCsv } = await import(MOD);
  let n = 0;
  const makeId = () => 'id' + n++;

  console.log('import');
  const r = importPilgrimCsv(FIXTURE, { makeId, now: 'T' });
  check('three distinct pilgrims; the exact repeat collapses', r.vault.length === 3 && r.stats.added === 3, r.stats);
  const ravi = r.vault.find((p) => p.name === 'Ravi Kumar');
  check('Aadhaar row maps gender/id/dob', ravi.gender === 'Male' && ravi.idProof === 'Aadhaar Card' && ravi.idNumber === '234567890123' && ravi.dob === '15/02/1970', ravi);
  const lakshmi = r.vault.find((p) => p.name === 'Lakshmi Devi');
  check('name whitespace collapsed, female, WhatsApp kept', !!lakshmi && lakshmi.gender === 'Female' && lakshmi.waPhone === '+919876543210', lakshmi);
  const arjun = r.vault.find((p) => p.name === 'Arjun K');
  check('passport row carries visa fields in form format',
    arjun.idProof === 'Passport' && arjun.idNumber === 'Z1234567' && arjun.passportCountry === 'USA' &&
    arjun.visaNumber === 'V998877' && arjun.visaType === 'OCI' && arjun.visaValidityDate === '31/12/2029', arjun);
  check('records have every form field', ['relationship', 'city', 'gothram', 'notes'].every((k) => k in ravi));
  check('two sets; the case-only duplicate pair is skipped', r.sets.length === 2 && r.stats.setsAdded === 2 && r.stats.setsSkipped === 1, r.stats);
  const family = r.sets.find((s) => s.name === 'Family');
  check('set members resolved by name, case-insensitively', family && family.pilgrimIds.join() === [ravi.id, lakshmi.id].join(), family);
  check('unknown member reported, rest of set kept',
    r.stats.missingMembers.join() === 'Nobody Here' && r.sets.find((s) => s.name === 'Trip').pilgrimIds.join() === arjun.id, r.stats);
  check('rows of other kinds are skipped', r.stats.skippedRows === 1, r.stats);

  console.log('merge');
  const edited = r.vault.map((p) => (p.id === ravi.id ? { ...p, relationship: 'Father', age: '55' } : p));
  const again = importPilgrimCsv(FIXTURE, { vault: edited, sets: r.sets, makeId, now: 'T2' });
  const ravi2 = again.vault.find((p) => p.id === ravi.id);
  check('re-import adds no pilgrims or sets', again.vault.length === 3 && again.sets.length === 2 && again.stats.added === 0, again.stats);
  check('re-import updates in place, keeps fields the CSV lacks', ravi2.age === '56' && ravi2.relationship === 'Father' && again.stats.updated === 1, ravi2);
  check('inputs are not modified', edited.find((p) => p.id === ravi.id).age === '55');

  console.log('export');
  const withExtra = r.vault.map((p) => (p.id === ravi.id ? { ...p, notes: 'needs "wheelchair", aisle' } : p));
  const big = { id: 'big', name: 'All three', pilgrimIds: [ravi.id, lakshmi.id, arjun.id, 'gone'] };
  const csv = exportPilgrimCsv({ vault: withExtra, sets: [...r.sets, big, { id: 'e', name: 'Empty', pilgrimIds: [] }] });
  const rows = parseCsv(csv);
  check('header starts with the shared layout', rows[0].slice(0, 21).join(',') === HEADER, rows[0]);
  const raviRow = rows.find((row) => row[4] === 'Ravi Kumar');
  const col = (name) => rows[0].indexOf(name);
  check('codes and ISO dates written back', raviRow[col('gender')] === '0' && raviRow[col('id_type')] === '0' && raviRow[col('dob')] === '1970-02-15', raviRow);
  const arjunRow = rows.find((row) => row[4] === 'Arjun K');
  check('passport columns written', arjunRow[col('pp_passport_no')] === 'Z1234567' && arjunRow[col('pp_visa_expiry')] === '2029-12-31', arjunRow);
  check('quotes and commas survive', raviRow[col('notes')] === 'needs "wheelchair", aisle', raviRow);
  const pairRow = rows.find((row) => row[1] === 'Family');
  check('two-member set written as a pair', pairRow[0] === 'pair' && pairRow[2] === 'Ravi Kumar' && pairRow[3] === 'Lakshmi Devi', pairRow);
  const bigRow = rows.find((row) => row[1] === 'All three');
  check('larger set written as "set", missing ids dropped', bigRow[0] === 'set' && bigRow.slice(2, 5).join() === 'Ravi Kumar,Lakshmi Devi,Arjun K' && bigRow[5] === '', bigRow);
  check('empty set left out', !rows.some((row) => row[1] === 'Empty'));

  console.log('round trip');
  const back = importPilgrimCsv(csv, { makeId, now: 'T3' });
  const strip = (p) => { const { id, createdAt, updatedAt, ...rest } = p; return JSON.stringify(rest); };
  check('every pilgrim field comes back', withExtra.every((p) => back.vault.some((q) => strip(q) === strip(p))), back.vault);
  check('every set comes back with the same members', back.sets.length === 3 && back.sets.find((s) => s.name === 'All three').pilgrimIds.length === 3, back.sets);

  console.log('bad input');
  let threw = false;
  try { importPilgrimCsv('a,b\n1,2\n', { makeId }); } catch { threw = true; }
  check('a CSV without book/name columns is rejected', threw);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
