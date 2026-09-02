// One pilgrim form, used by both the panel's "Pilgrims for this booking" tab
// and the Settings page's "Saved pilgrims" screen.
//
// These two were separate copies that drifted apart — the panel grew contact
// details the Settings copy never got — so a person saved in one place came out
// missing fields in the other. Everything about the shape of a pilgrim record
// now lives here: the field list, the form markup, passport show/hide, and the
// live validation wiring. Callers only decide what to do with the result.
import { t } from "./i18n.js";
import { liveValidate } from "./formValidation.js";
import { validatePilgrim } from "./validation.js";

/** Contact details TTD asks for once per booking, carried on the pilgrim. */
export const CONTACT_FIELDS = ["email", "city", "state", "country", "pincode", "gothram"];

export const emptyPilgrim = () => ({
  name: "",
  relationship: "",
  age: "",
  gender: "",
  idProof: "Aadhaar Card",
  idNumber: "",
  visaType: "",
  visaNumber: "",
  visaValidityDate: "",
  passportCountry: "",
  email: "",
  city: "",
  state: "",
  country: "",
  pincode: "",
  gothram: "",
  notes: "",
});

/** The booking contact = the first pilgrim who actually has each detail set. */
export function deriveContact(pilgrims) {
  const out = {};
  for (const field of CONTACT_FIELDS) {
    const donor = (pilgrims || []).find((p) => p && p[field]);
    if (donor) out[field] = donor[field];
  }
  return out;
}

/**
 * Builds the shared form.
 *
 * @param {object}   opts
 * @param {object}   opts.value          Record to pre-fill from.
 * @param {boolean}  opts.editing        Switches the submit button's label.
 * @param {boolean}  opts.requireIdNumber Panel bookings need a valid ID; a
 *                                       saved pilgrim may not have one yet, so
 *                                       there it is only checked once typed.
 * @param {boolean}  opts.contactOpen    Start the contact block expanded.
 * @param {Function} opts.onSubmit       Called with the validated field data.
 * @param {Function} [opts.onCancel]     Shows a Cancel button when provided.
 * @param {Function} [opts.onInvalid]    Called instead of onSubmit on errors.
 */
export function buildPilgrimForm({
  value,
  editing = false,
  requireIdNumber = true,
  contactOpen = false,
  onSubmit,
  onCancel,
  onInvalid,
}) {
  const record = { ...emptyPilgrim(), ...(value || {}) };
  const formEl = document.createElement("form");
  formEl.className = "pilgrim-form";
  formEl.innerHTML = `
    <div class="form-row">
      <div class="form-group"><label>${t("field_name")}</label><input name="name" required /></div>
      <div class="form-group"><label>${t("opt_vault_relationship")}</label><input name="relationship" placeholder="${t("opt_vault_relationship_placeholder")}" /></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>${t("field_age")}</label><input name="age" type="number" min="0" max="130" required /></div>
      <div class="form-group"><label>${t("field_gender")}</label>
        <select name="gender" required>
          <option value="">${t("select_placeholder")}</option>
          <option value="Male">${t("gender_male")}</option>
          <option value="Female">${t("gender_female")}</option>
          <option value="Transgender">${t("gender_transgender")}</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>${t("field_id_proof")}</label>
        <select name="idProof">
          <option value="Aadhaar Card">${t("idproof_aadhaar")}</option>
          <option value="Passport">${t("idproof_passport")}</option>
        </select>
      </div>
      <div class="form-group"><label>${t("field_id_proof_number")}</label><input name="idNumber"${requireIdNumber ? " required" : ""} /></div>
    </div>
    <div class="passport-extra" hidden>
      <div class="passport-note">🛂 ${t("validation_passport_needs")}</div>
      <div class="form-row">
        <div class="form-group"><label>${t("field_visa_type")}</label><input name="visaType" placeholder="${t("field_visa_type_placeholder")}" /></div>
        <div class="form-group"><label>${t("field_visa_number")}</label><input name="visaNumber" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t("field_visa_validity")}</label><input name="visaValidityDate" placeholder="${t("field_date_placeholder")}" inputmode="numeric" /></div>
        <div class="form-group"><label>${t("field_country")}</label><input name="passportCountry" placeholder="${t("field_country_placeholder")}" /></div>
      </div>
    </div>
    <details class="pilgrim-contact-details"${contactOpen ? " open" : ""}>
      <summary>${t("pilgrim_contact_heading")}</summary>
      <small class="field-hint">${t("pilgrim_contact_hint")}</small>
      <div class="form-row">
        <div class="form-group"><label>${t("field_email")}</label><input name="email" type="email" /></div>
        <div class="form-group"><label>${t("field_city")}</label><input name="city" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t("field_state")}</label><input name="state" /></div>
        <div class="form-group"><label>${t("field_country")}</label><input name="country" placeholder="${t("field_country_placeholder")}" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t("field_pincode")}</label><input name="pincode" maxlength="6" /></div>
        <div class="form-group"><label>${t("field_gothram")}</label><input name="gothram" /></div>
      </div>
    </details>
    <div class="form-group"><label>${t("opt_vault_notes")}</label><input name="notes" placeholder="${t("opt_vault_notes_placeholder")}" /></div>
    <div class="form-actions">
      <button type="submit" class="btn-primary">${t(editing ? "action_update_pilgrim" : "action_add_pilgrim")}</button>
      ${onCancel ? `<button type="button" class="btn-secondary" data-cancel>${t("action_cancel")}</button>` : ""}
    </div>
  `;

  for (const [key, val] of Object.entries(record)) {
    const field = formEl.elements[key];
    if (field) field.value = val ?? "";
  }

  const idProofSelect = formEl.elements.idProof;
  const passportExtra = formEl.querySelector(".passport-extra");
  const syncPassportVisibility = () => {
    passportExtra.hidden = idProofSelect.value !== "Passport";
  };
  syncPassportVisibility();

  const validator = liveValidate(formEl, (data) =>
    validatePilgrim(data, { requireIdNumber: requireIdNumber || !!(data.idNumber || "").trim() })
  );
  idProofSelect.addEventListener("change", () => {
    syncPassportVisibility();
    validator.run();
  });

  const cancelBtn = formEl.querySelector("[data-cancel]");
  if (cancelBtn && onCancel) cancelBtn.addEventListener("click", onCancel);

  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const check = validator.revealAll();
    if (check.errors.length > 0) {
      const firstBad = formEl.querySelector(".invalid");
      if (firstBad) firstBad.focus();
      if (onInvalid) onInvalid(check);
      return;
    }
    await onSubmit(Object.fromEntries(new FormData(formEl).entries()));
  });

  return { el: formEl, validator };
}
