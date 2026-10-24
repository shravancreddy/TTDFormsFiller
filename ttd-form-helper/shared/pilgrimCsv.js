// CSV import/export for saved pilgrims and pilgrim sets.
//
// The column layout is the one other TTD autofill tools export, so a list kept
// there can be brought over as-is (and taken back):
//
//   book,label,mobile,email,name,age,gender,id_type,id_number,pp_passport_no,
//   pp_country,pp_visa_no,pp_visa_type,pp_visa_expiry,temple_match,temple_name,
//   seva_name,seva_persons,seva_amount,wa_phone,dob
//
// - "pilgrim" rows are people. gender is 0 Male / 1 Female / 2 Transgender,
//   id_type is 0 Aadhaar / 1 Passport, dates are YYYY-MM-DD.
// - "pair" rows are sets: label is the set's name and the member names follow
//   in the next columns (mobile, email, ...). A pair holds two people; we also
//   write and read "set" rows, which carry any number of names the same way.
//
// Fields that layout has no column for (relationship, notes, contact details)
// are appended after dob so an export re-imports without losing anything;
// columns are found by header name, so their order doesn't matter on import.
//
// No imports: kept pure so it can be tested under plain Node.

const BASE_COLUMNS = [
  "book", "label", "mobile", "email", "name", "age", "gender", "id_type", "id_number",
  "pp_passport_no", "pp_country", "pp_visa_no", "pp_visa_type", "pp_visa_expiry",
  "temple_match", "temple_name", "seva_name", "seva_persons", "seva_amount", "wa_phone", "dob",
];
/** Our own extra columns: CSV header -> pilgrim record field. */
const EXTRA_COLUMNS = {
  relationship: "relationship", notes: "notes", city: "city", state: "state",
  country: "country", pincode: "pincode", gothram: "gothram",
};
export const CSV_COLUMNS = [...BASE_COLUMNS, ...Object.keys(EXTRA_COLUMNS)];

// Members of a set row start in the column after the label.
const SET_MEMBER_START = 2;

const GENDER_FROM_CODE = { 0: "Male", 1: "Female", 2: "Transgender" };
const GENDER_TO_CODE = { Male: "0", Female: "1", Transgender: "2" };

// ------------------------------------------------------------ raw CSV ----
/** RFC 4180 parser: quoted fields, "" escapes, CRLF/LF, a leading BOM. */
export function parseCsv(text) {
  const src = String(text || "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// ------------------------------------------------------------- helpers ----
const normName = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
const normId = (s) => String(s || "").replace(/[\s-]/g, "").toUpperCase();
const pilgrimKey = (p) => `${normName(p.name)}|${normId(p.idNumber)}`;

/** YYYY-MM-DD (or already DD/MM/YYYY) -> DD/MM/YYYY, the format the forms use. */
function toDdMmYyyy(value) {
  const s = String(value || "").trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return `${iso[3].padStart(2, "0")}/${iso[2].padStart(2, "0")}/${iso[1]}`;
  return s;
}

function toIsoDate(value) {
  const s = String(value || "").trim();
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return s;
}

function genderFromCsv(value) {
  const s = String(value || "").trim();
  if (s in GENDER_FROM_CODE) return GENDER_FROM_CODE[s];
  const word = s.toLowerCase();
  if (word === "m" || word === "male") return "Male";
  if (word === "f" || word === "female") return "Female";
  if (word === "t" || word === "transgender") return "Transgender";
  return "";
}

function idProofFromCsv(value) {
  const s = String(value || "").trim().toLowerCase();
  return s === "1" || s === "passport" ? "Passport" : "Aadhaar Card";
}

/** One "pilgrim" CSV row -> the fields of a saved-pilgrim record it sets. */
function recordFromRow(get) {
  const idProof = idProofFromCsv(get("id_type"));
  const rec = {
    name: get("name").trim().replace(/\s+/g, " "),
    age: get("age").trim(),
    gender: genderFromCsv(get("gender")),
    idProof,
    idNumber: (get("id_number") || (idProof === "Passport" ? get("pp_passport_no") : "")).trim(),
    email: get("email").trim(),
    // No form field for these yet, but they're kept on the record so an export
    // gives them back.
    mobile: get("mobile").trim(),
    waPhone: get("wa_phone").trim(),
    dob: toDdMmYyyy(get("dob")),
  };
  if (idProof === "Passport") {
    rec.passportCountry = get("pp_country").trim();
    rec.visaNumber = get("pp_visa_no").trim();
    rec.visaType = get("pp_visa_type").trim();
    rec.visaValidityDate = toDdMmYyyy(get("pp_visa_expiry"));
  }
  for (const [col, field] of Object.entries(EXTRA_COLUMNS)) rec[field] = get(col).trim();
  return rec;
}

// --------------------------------------------------------------- import ----
/**
 * Merges a CSV into the saved pilgrims and sets.
 *
 * A pilgrim with the same name and ID number as one already saved updates that
 * record (non-empty CSV values win) instead of adding a copy, so importing the
 * same file twice changes nothing. Set members are matched by name: the first
 * pilgrim in the file with that name, else the first saved one. A set whose
 * name and members match one that exists is skipped.
 *
 * @returns {{ vault, sets, stats }} new arrays (inputs are not modified) and
 *   counts: added, updated, setsAdded, setsSkipped, skippedRows, missingMembers
 *   (names a set referred to that matched nobody).
 * @throws {Error} when the text has no "book" / "name" header.
 */
export function importPilgrimCsv(text, { vault = [], sets = [], makeId, now = new Date().toISOString() }) {
  const rows = parseCsv(text);
  const header = (rows.shift() || []).map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  if (!("book" in col) || !("name" in col)) throw new Error("not a pilgrim CSV");

  const outVault = vault.map((v) => ({ ...v }));
  const outSets = sets.map((s) => ({ ...s }));
  const stats = { added: 0, updated: 0, setsAdded: 0, setsSkipped: 0, skippedRows: 0, missingMembers: [] };

  const byKey = new Map();
  for (const v of outVault) if (!byKey.has(pilgrimKey(v))) byKey.set(pilgrimKey(v), v);
  const fileNames = new Map(); // name -> id, from this file's pilgrim rows
  const setRows = [];

  for (const row of rows) {
    const get = (name) => (name in col ? row[col[name]] ?? "" : "");
    const book = get("book").trim().toLowerCase();
    if (book === "pair" || book === "set") {
      setRows.push(row);
      continue;
    }
    if (book !== "pilgrim") {
      stats.skippedRows++;
      continue;
    }
    const rec = recordFromRow(get);
    if (!rec.name) {
      stats.skippedRows++;
      continue;
    }
    const existing = byKey.get(pilgrimKey(rec));
    if (existing) {
      const before = JSON.stringify(existing);
      for (const [k, v] of Object.entries(rec)) if (v !== "") existing[k] = v;
      if (JSON.stringify(existing) !== before) {
        existing.updatedAt = now;
        stats.updated++;
      }
      if (!fileNames.has(normName(rec.name))) fileNames.set(normName(rec.name), existing.id);
      continue;
    }
    const entry = { ...emptyRecord(), ...rec, id: makeId(), createdAt: now, updatedAt: now };
    outVault.push(entry);
    byKey.set(pilgrimKey(entry), entry);
    if (!fileNames.has(normName(rec.name))) fileNames.set(normName(rec.name), entry.id);
    stats.added++;
  }

  const savedNames = new Map();
  for (const v of outVault) if (!savedNames.has(normName(v.name))) savedNames.set(normName(v.name), v.id);
  const setKey = (name, ids) => `${normName(name)}|${[...ids].sort().join(",")}`;
  const knownSets = new Set(outSets.map((s) => setKey(s.name, s.pilgrimIds || [])));
  const labelCol = "label" in col ? col.label : 1;

  for (const row of setRows) {
    const name = String(row[labelCol] || "").trim() || "Untitled set";
    const ids = [];
    for (const cell of row.slice(SET_MEMBER_START)) {
      const member = normName(cell);
      if (!member) continue;
      const id = fileNames.get(member) || savedNames.get(member);
      if (!id) stats.missingMembers.push(cell.trim());
      else if (!ids.includes(id)) ids.push(id);
    }
    const key = setKey(name, ids);
    if (ids.length === 0 || knownSets.has(key)) {
      stats.setsSkipped++;
      continue;
    }
    knownSets.add(key);
    outSets.push({ id: makeId(), name, pilgrimIds: ids, createdAt: now, updatedAt: now });
    stats.setsAdded++;
  }

  return { vault: outVault, sets: outSets, stats };
}

// Same shape as pilgrimForm.js's emptyPilgrim (not imported, to stay DOM-free).
function emptyRecord() {
  return {
    name: "", relationship: "", age: "", gender: "", idProof: "Aadhaar Card", idNumber: "",
    visaType: "", visaNumber: "", visaValidityDate: "", passportCountry: "",
    email: "", city: "", state: "", country: "", pincode: "", gothram: "", notes: "",
  };
}

// --------------------------------------------------------------- export ----
/** Saved pilgrims and sets -> CSV text in the layout described at the top. */
export function exportPilgrimCsv({ vault = [], sets = [] }) {
  const index = Object.fromEntries(CSV_COLUMNS.map((c, i) => [c, i]));
  const rows = [CSV_COLUMNS];

  for (const p of vault) {
    const row = CSV_COLUMNS.map(() => "");
    const set = (c, v) => (row[index[c]] = v ?? "");
    const passport = p.idProof === "Passport";
    set("book", "pilgrim");
    set("mobile", p.mobile);
    set("email", p.email);
    set("name", p.name);
    set("age", p.age);
    set("gender", GENDER_TO_CODE[p.gender] ?? "");
    set("id_type", passport ? "1" : "0");
    set("id_number", p.idNumber);
    if (passport) {
      set("pp_passport_no", p.idNumber);
      set("pp_country", p.passportCountry);
      set("pp_visa_no", p.visaNumber);
      set("pp_visa_type", p.visaType);
      set("pp_visa_expiry", toIsoDate(p.visaValidityDate));
    }
    set("wa_phone", p.waPhone);
    set("dob", toIsoDate(p.dob));
    for (const [c, field] of Object.entries(EXTRA_COLUMNS)) set(c, p[field]);
    rows.push(row);
  }

  const nameById = new Map(vault.map((p) => [p.id, p.name]));
  for (const s of sets) {
    const names = (s.pilgrimIds || []).map((id) => nameById.get(id)).filter(Boolean);
    if (names.length === 0) continue;
    const row = CSV_COLUMNS.map(() => "");
    row[0] = names.length === 2 ? "pair" : "set";
    row[1] = s.name;
    names.forEach((n, i) => (row[SET_MEMBER_START + i] = n));
    rows.push(row);
  }

  return toCsv(rows);
}
