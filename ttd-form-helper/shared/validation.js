// Field-level validation shared by every form in the extension.
//
// Two severities:
//   "error"   — the TTD site will almost certainly reject this; block the fill.
//   "warning" — looks unusual or incomplete; let the user proceed anyway.
//
// Rules were checked against what the TTD booking forms actually accept
// (12-digit Verhoeff-valid Aadhaar, 10-digit Indian mobiles starting 6-9,
// 6-digit PIN codes, and the five passport/visa fields the passport popup
// requires before its Submit button becomes usable).

// ------------------------------------------------------- Aadhaar (Verhoeff) --
// Aadhaar's 12th digit is a Verhoeff checksum over the preceding 11, so a typo
// in any single digit is detectable before the user ever hits the TTD site.
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function verhoeffCheck(digits) {
  let c = 0;
  const reversed = String(digits).split("").reverse();
  for (let i = 0; i < reversed.length; i++) {
    const digit = Number(reversed[i]);
    if (Number.isNaN(digit)) return false;
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digit]];
  }
  return c === 0;
}

export function validateAadhaar(value) {
  const raw = String(value || "").replace(/[\s-]/g, "");
  if (!raw) return { ok: false, severity: "error", message: "Aadhaar number is required" };
  if (!/^\d+$/.test(raw)) return { ok: false, severity: "error", message: "Aadhaar must be digits only" };
  if (raw.length !== 12) return { ok: false, severity: "error", message: `Aadhaar must be 12 digits (you entered ${raw.length})` };
  if (/^[01]/.test(raw)) return { ok: false, severity: "error", message: "Aadhaar cannot start with 0 or 1" };
  if (!verhoeffCheck(raw)) return { ok: false, severity: "error", message: "Aadhaar checksum failed — check for a typo" };
  return { ok: true };
}

// ------------------------------------------------------------------ others --
export function validatePassportNumber(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return { ok: false, severity: "error", message: "Passport number is required" };
  if (!/^[A-Z0-9]{6,12}$/.test(raw)) {
    return { ok: false, severity: "error", message: "Passport number should be 6–12 letters/digits" };
  }
  // Indian passports are 1 letter + 7 digits; anything else is likely foreign
  // and perfectly valid, so this is only a nudge.
  if (!/^[A-Z]\d{7}$/.test(raw)) {
    return { ok: true, severity: "warning", message: "Not the usual Indian format (1 letter + 7 digits) — fine for foreign passports" };
  }
  return { ok: true };
}

export function validateMobile(value, { required = false } = {}) {
  const raw = String(value || "").replace(/[\s-]/g, "");
  if (!raw) return required ? { ok: false, severity: "error", message: "Mobile number is required" } : { ok: true };
  if (!/^\d+$/.test(raw)) return { ok: false, severity: "error", message: "Mobile must be digits only" };
  if (raw.length !== 10) return { ok: false, severity: "error", message: `Mobile must be 10 digits (you entered ${raw.length})` };
  if (!/^[6-9]/.test(raw)) return { ok: false, severity: "error", message: "Indian mobile numbers start with 6, 7, 8 or 9" };
  return { ok: true };
}

export function validatePincode(value, { required = false } = {}) {
  const raw = String(value || "").replace(/\s/g, "");
  if (!raw) return required ? { ok: false, severity: "error", message: "PIN code is required" } : { ok: true };
  if (!/^\d{6}$/.test(raw)) return { ok: false, severity: "error", message: "PIN code must be exactly 6 digits" };
  if (/^0/.test(raw)) return { ok: false, severity: "error", message: "PIN code cannot start with 0" };
  return { ok: true };
}

export function validateEmail(value, { required = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return required ? { ok: false, severity: "error", message: "Email is required" } : { ok: true };
  if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(raw)) {
    return { ok: false, severity: "error", message: "That doesn't look like a valid email address" };
  }
  return { ok: true };
}

export function validateName(value, { required = true, label = "Name" } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return required ? { ok: false, severity: "error", message: `${label} is required` } : { ok: true };
  if (raw.length < 2) return { ok: false, severity: "error", message: `${label} is too short` };
  if (!/^[A-Za-zऀ-ൿ][A-Za-zऀ-ൿ\s.'-]*$/.test(raw)) {
    return { ok: false, severity: "warning", message: `${label} contains unusual characters — TTD expects it as printed on the ID` };
  }
  return { ok: true };
}

export function validateAge(value, { required = true, min = 0, max = 120 } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return required ? { ok: false, severity: "error", message: "Age is required" } : { ok: true };
  const n = Number(raw);
  if (!Number.isInteger(n)) return { ok: false, severity: "error", message: "Age must be a whole number" };
  if (n < min || n > max) return { ok: false, severity: "error", message: `Age must be between ${min} and ${max}` };
  return { ok: true };
}

/** Parses DD/MM/YYYY strictly (the format every TTD date field expects). */
export function parseDdMmYyyy(value) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || "").trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function validateDob(value, { required = true, age } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return required ? { ok: false, severity: "error", message: "Date of birth is required" } : { ok: true };
  const date = parseDdMmYyyy(raw);
  if (!date) return { ok: false, severity: "error", message: "Use DD/MM/YYYY, e.g. 09/04/1986" };
  const now = new Date();
  if (date > now) return { ok: false, severity: "error", message: "Date of birth cannot be in the future" };
  if (now.getFullYear() - date.getFullYear() > 120) return { ok: false, severity: "error", message: "Date of birth looks too far in the past" };
  if (age) {
    const derived = computeAge(date, now);
    if (Math.abs(derived - Number(age)) > 1) {
      return { ok: false, severity: "warning", message: `Age ${age} doesn't match this date of birth (${derived})` };
    }
  }
  return { ok: true };
}

export function computeAge(dob, now = new Date()) {
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

export function validateVisaValidity(value, { required = true } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return required ? { ok: false, severity: "error", message: "Visa validity date is required for passport holders" } : { ok: true };
  const date = parseDdMmYyyy(raw);
  if (!date) return { ok: false, severity: "error", message: "Use DD/MM/YYYY, e.g. 31/12/2027" };
  if (date < new Date()) return { ok: false, severity: "warning", message: "This visa has already expired" };
  return { ok: true };
}

export function validateVisaType(value, { required = true } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return required ? { ok: false, severity: "error", message: "Visa type is required for passport holders" } : { ok: true };
  if (!/^[A-Za-z0-9\s-]+$/.test(raw)) return { ok: false, severity: "error", message: "Visa type must be letters and digits only" };
  return { ok: true };
}

export function validateVisaNumber(value, { required = true } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return required ? { ok: false, severity: "error", message: "Visa / OCI number is required for passport holders" } : { ok: true };
  if (!/^[A-Za-z0-9-]{4,20}$/.test(raw)) return { ok: false, severity: "error", message: "Visa number should be 4–20 letters/digits" };
  return { ok: true };
}

export function validateCountry(value, { required = true, label = "Country" } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return required ? { ok: false, severity: "error", message: `${label} is required for passport holders` } : { ok: true };
  if (raw.length < 3) return { ok: false, severity: "error", message: `${label} looks too short` };
  return { ok: true };
}

// ----------------------------------------------------- whole-record checks --
/**
 * Validates one pilgrim/person record (the Pilgrim Booking + Srivani shape).
 * Returns { fields: {name: result}, errors: [], warnings: [], complete: bool }.
 */
export function validatePilgrim(pilgrim, { requireIdNumber = true } = {}) {
  const fields = {};
  fields.name = validateName(pilgrim.name, { label: "Name" });
  fields.age = validateAge(pilgrim.age);
  fields.gender = pilgrim.gender
    ? { ok: true }
    : { ok: false, severity: "error", message: "Gender is required" };

  const isPassport = pilgrim.idProof === "Passport";
  if (isPassport) {
    fields.idNumber = requireIdNumber
      ? validatePassportNumber(pilgrim.idNumber)
      : { ok: true };
    // The TTD passport popup will not submit until all four of these are set.
    fields.visaType = validateVisaType(pilgrim.visaType);
    fields.visaNumber = validateVisaNumber(pilgrim.visaNumber);
    fields.visaValidityDate = validateVisaValidity(pilgrim.visaValidityDate);
    fields.passportCountry = validateCountry(pilgrim.passportCountry, { label: "Nationality / country" });
  } else {
    fields.idNumber = requireIdNumber ? validateAadhaar(pilgrim.idNumber) : { ok: true };
  }

  return summarise(fields);
}

/** Validates the shared contact block on the pilgrim booking page. */
export function validateContact(contact) {
  const fields = {
    email: validateEmail(contact.email),
    pincode: validatePincode(contact.pincode),
  };
  return summarise(fields);
}

/** Validates a Srivari Seva / Seva Group sevak record. */
export function validateSevak(sevak) {
  const fields = {
    sevakName: validateName(sevak.sevakName, { label: "Name" }),
    fatherOrSpouseName: validateName(sevak.fatherOrSpouseName, { required: false, label: "Father/Spouse name" }),
    dob: validateDob(sevak.dob, { age: sevak.age }),
    age: validateAge(sevak.age, { min: 18, max: 100 }),
    mobileNo: validateMobile(sevak.mobileNo, { required: true }),
    altMobileNo: validateMobile(sevak.altMobileNo),
    email: validateEmail(sevak.email, { required: true }),
    pincode: validatePincode(sevak.pincode, { required: true }),
    idNumber: sevak.idType === "Passport" ? validatePassportNumber(sevak.idNumber) : validateAadhaar(sevak.idNumber),
  };
  if (!sevak.mentallyFit || !sevak.physicallyFit) {
    fields.fitness = { ok: false, severity: "warning", message: "TTD requires both fitness declarations to be ticked" };
  }
  return summarise(fields);
}

function summarise(fields) {
  const errors = [];
  const warnings = [];
  for (const [field, result] of Object.entries(fields)) {
    if (!result) continue;
    if (!result.ok && result.severity === "error") errors.push({ field, message: result.message });
    else if (result.message && (result.severity === "warning" || !result.ok)) warnings.push({ field, message: result.message });
  }
  return { fields, errors, warnings, complete: errors.length === 0 };
}

/** Short human summary used on list cards, e.g. "2 issues". */
export function issueBadge(result) {
  if (!result) return null;
  if (result.errors.length > 0) {
    return { kind: "error", text: result.errors.length === 1 ? "1 issue" : `${result.errors.length} issues` };
  }
  if (result.warnings.length > 0) {
    return { kind: "warning", text: result.warnings.length === 1 ? "1 note" : `${result.warnings.length} notes` };
  }
  return { kind: "ok", text: "Ready" };
}
