import { STORAGE_KEYS, uid } from "../../shared/storage.js";
import { secureGet as storageGet, secureSet as storageSet } from "../../shared/secureStore.js";
import { sendToActiveTab, describeFillResult, describeThrownError } from "../../shared/messaging.js";
import { t } from "../../shared/i18n.js";
import { showMessage } from "../toast.js";
import { createVaultPicker } from "./vaultPicker.js";
import { validatePilgrim } from "../../shared/validation.js";
import { liveValidate, buildBadge, buildIssueList } from "../../shared/formValidation.js";

const MAX_PILGRIMS = 6;
// Contact details live on the pilgrim now. There is no separate global contact
// record to keep in sync — the booking's contact block is filled from the first
// pilgrim who has these set, which is the one detail TTD asks for per booking
// rather than per person.
const CONTACT_FIELDS = ["email", "city", "state", "country", "pincode", "gothram"];
const emptyPilgrim = () => ({
  name: "", age: "", gender: "", idProof: "Aadhaar Card", idNumber: "",
  visaNumber: "", visaType: "", visaValidityDate: "", passportCountry: "",
  email: "", city: "", state: "", country: "", pincode: "", gothram: "",
});

/** The booking contact = the first pilgrim who actually has contact details. */
function deriveContact(pilgrims) {
  const out = {};
  for (const field of CONTACT_FIELDS) {
    const donor = (pilgrims || []).find((p) => p && p[field]);
    if (donor) out[field] = donor[field];
  }
  return out;
}

export async function renderPilgrimTab(container) {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "seva-container";
  container.appendChild(wrap);

  let pilgrims = [];
  let editingId = null;
  let form = emptyPilgrim();
  let sets = [];

  const stored = await storageGet([STORAGE_KEYS.pilgrims, STORAGE_KEYS.contact, STORAGE_KEYS.sets]);
  pilgrims = Array.isArray(stored[STORAGE_KEYS.pilgrims]) ? stored[STORAGE_KEYS.pilgrims] : [];
  sets = Array.isArray(stored[STORAGE_KEYS.sets]) ? stored[STORAGE_KEYS.sets] : [];

  // The derived contact is still written to its own storage key: the content
  // script, the background worker's secure read, and backup/restore all read
  // it, and keeping it in sync means none of them need to know it moved.
  const persistPilgrims = () =>
    storageSet({
      [STORAGE_KEYS.pilgrims]: pilgrims,
      [STORAGE_KEYS.contact]: deriveContact(pilgrims),
    });

  // One-time migration off the old separate contact record: anything it still
  // holds is copied onto pilgrims that don't have their own value yet, so
  // nobody loses details they saved before contact moved onto the pilgrim.
  const legacyContact = stored[STORAGE_KEYS.contact] || {};
  if (pilgrims.length > 0 && CONTACT_FIELDS.some((f) => legacyContact[f])) {
    let migrated = false;
    pilgrims = pilgrims.map((p) => {
      const next = { ...p };
      for (const f of CONTACT_FIELDS) {
        if (!next[f] && legacyContact[f]) {
          next[f] = legacyContact[f];
          migrated = true;
        }
      }
      return next;
    });
    if (migrated) await persistPilgrims();
  }

  function render() {
    wrap.innerHTML = "";

    // Fill-all bar
    const fillSection = document.createElement("div");
    fillSection.className = "fill-all-section";
    const fillBtn = document.createElement("button");
    fillBtn.type = "button";
    fillBtn.className = "btn-fill-all";
    fillBtn.textContent = t("action_fill_all");
    fillBtn.disabled = pilgrims.length === 0;
    fillBtn.addEventListener("click", onFillAll);
    fillSection.appendChild(fillBtn);

    // Roll every saved pilgrim's problems into one list above the Fill button,
    // so nothing is discovered only after the TTD page rejects it.
    const blocking = pilgrims
      .map((p) => ({ pilgrim: p, result: validatePilgrim(p) }))
      .filter((x) => x.result.errors.length > 0);
    if (blocking.length > 0) {
      const combined = {
        errors: blocking.flatMap((x) =>
          x.result.errors.map((e) => ({ field: e.field, message: `${x.pilgrim.name || t("vault_unnamed")}: ${e.message}` }))
        ),
        warnings: [],
      };
      const list = buildIssueList(combined);
      if (list) fillSection.appendChild(list);
    }
    wrap.appendChild(fillSection);

    if (sets.length > 0) {
      const setLoader = document.createElement("div");
      setLoader.className = "set-loader";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "vault-toggle";
      toggle.innerHTML = `<span>${t("set_load", { count: sets.length })}</span><span>▾</span>`;
      const list = document.createElement("div");
      list.className = "set-list";
      list.hidden = true;
      toggle.addEventListener("click", () => {
        list.hidden = !list.hidden;
      });
      sets.forEach((s) => {
        const row = document.createElement("div");
        row.className = "set-row";
        const info = document.createElement("div");
        info.innerHTML = `<div class="set-row-name">${escapeHtml(s.name)}</div><div class="set-row-meta">${t("set_replaces", { count: (s.pilgrimIds || []).length })}</div>`;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-secondary btn-sm";
        btn.title = t("set_replace_title");
        btn.textContent = t("set_action_load");
        btn.addEventListener("click", async () => {
          const vault = (await storageGet([STORAGE_KEYS.vault]))[STORAGE_KEYS.vault] || [];
          const members = (s.pilgrimIds || []).map((id) => vault.find((v) => v.id === id)).filter(Boolean);
          if (members.length === 0) {
            showMessage(t("set_no_pilgrims"), "warn");
            return;
          }
          const capped = members.slice(0, MAX_PILGRIMS);
          pilgrims = capped.map((m) => ({ ...emptyPilgrim(), ...m, id: uid() }));
          await persistPilgrims();
          showMessage(members.length > MAX_PILGRIMS ? t("msg_loaded_first", { count: MAX_PILGRIMS, total: members.length }) : t("msg_loaded_from_set", { count: capped.length }));
          render();
        });
        row.appendChild(info);
        row.appendChild(btn);
        list.appendChild(row);
      });
      setLoader.appendChild(toggle);
      setLoader.appendChild(list);
      wrap.appendChild(setLoader);
    }

    // Pilgrim list
    const pilgrimSection = document.createElement("section");
    pilgrimSection.className = "pilgrims-section";
    const heading = document.createElement("h2");
    heading.textContent = t("pilgrims_heading", { count: pilgrims.length }) + " " + t("pilgrim_limit", { count: pilgrims.length });
    pilgrimSection.appendChild(heading);

    if (pilgrims.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = `<strong>${t("empty_no_pilgrims_title")}</strong><br>${t("empty_no_pilgrims_body")}<br><small>${t("empty_no_pilgrims_hint")}</small>`;
      pilgrimSection.appendChild(empty);
    } else {
      pilgrims.forEach((p) => {
        const card = document.createElement("div");
        card.className = "pilgrim-card";
        const info = document.createElement("div");
        info.className = "pilgrim-info";
        const nameLine = document.createElement("strong");
        nameLine.textContent = p.name;
        const badge = buildBadge(validatePilgrim(p));
        if (badge) {
          nameLine.appendChild(document.createTextNode(" "));
          nameLine.appendChild(badge);
        }
        const detailLine = document.createElement("div");
        detailLine.className = "pilgrim-details";
        detailLine.textContent = t("pilgrim_details_line", { age: p.age, gender: p.gender, idProof: p.idProof });
        info.appendChild(nameLine);
        info.appendChild(detailLine);
        const actions = document.createElement("div");
        actions.className = "pilgrim-actions";
        // Fill just this one person into the next empty slot — useful when the
        // TTD form was partly filled already, or a single member is being added.
        const fillOneBtn = document.createElement("button");
        fillOneBtn.textContent = "⚡";
        fillOneBtn.title = t("action_fill_one");
        fillOneBtn.addEventListener("click", () => onFillOne(p));
        const editBtn = document.createElement("button");
        editBtn.textContent = "✏️";
        editBtn.title = t("action_edit_pilgrim");
        editBtn.addEventListener("click", () => {
          form = { ...emptyPilgrim(), ...p };
          editingId = p.id;
          render();
        });
        const delBtn = document.createElement("button");
        delBtn.className = "btn-delete";
        delBtn.textContent = "🗑️";
        delBtn.addEventListener("click", async () => {
          pilgrims = pilgrims.filter((x) => x.id !== p.id);
          await persistPilgrims();
          showMessage(t("msg_pilgrim_deleted"));
          render();
        });
        actions.appendChild(fillOneBtn);
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        card.appendChild(info);
        card.appendChild(actions);
        pilgrimSection.appendChild(card);
      });
    }

    const vaultPicker = createVaultPicker({
      isAdded: (entry) => pilgrims.some((p) => p.vaultId === entry.id),
      isDisabled: () => pilgrims.length >= MAX_PILGRIMS,
      onAdd: async (entry) => {
        if (pilgrims.length >= MAX_PILGRIMS) {
          showMessage(t("msg_max_pilgrims"));
          return;
        }
        pilgrims = [...pilgrims, { ...emptyPilgrim(), ...entry, id: uid(), vaultId: entry.id }];
        await persistPilgrims();
        showMessage(t("msg_added_pilgrim", { name: entry.name || t("noun_pilgrim") }));
        render();
      },
    });
    pilgrimSection.appendChild(vaultPicker.el);
    wrap.appendChild(pilgrimSection);

    // Add/edit form
    const formSection = document.createElement("section");
    formSection.className = "form-section";
    const formHeading = document.createElement("h3");
    formHeading.textContent = t(editingId ? "action_edit_pilgrim" : "action_add_pilgrim");
    formSection.appendChild(formHeading);

    // Open the contact block by default for the pilgrim whose details will
    // actually be used for the booking (the first one), or when editing
    // someone who already has them — otherwise keep the form compact.
    const isFirstPilgrim = editingId ? pilgrims[0]?.id === editingId : pilgrims.length === 0;
    const contactOpen = isFirstPilgrim || CONTACT_FIELDS.some((f) => form[f]);

    const formEl = document.createElement("form");
    formEl.innerHTML = `
      <div class="form-row">
        <div class="form-group"><label>${t("field_name")}</label><input name="name" required /></div>
        <div class="form-group"><label>${t("field_age")}</label><input name="age" type="number" min="0" max="130" required /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t("field_gender")}</label>
          <select name="gender" required>
            <option value="">${t("select_placeholder")}</option>
            <option value="Male">${t("gender_male")}</option>
            <option value="Female">${t("gender_female")}</option>
            <option value="Transgender">${t("gender_transgender")}</option>
          </select>
        </div>
        <div class="form-group"><label>${t("field_id_proof")}</label>
          <select name="idProof">
            <option value="Aadhaar Card">${t("idproof_aadhaar")}</option>
            <option value="Passport">${t("idproof_passport")}</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label>${t("field_id_proof_number")}</label><input name="idNumber" required /></div>
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
      <div class="form-actions">
        <button type="submit" class="btn-primary">${t(editingId ? "action_update_pilgrim" : "action_add_pilgrim")}</button>
        ${editingId ? `<button type="button" class="btn-secondary" data-cancel>${t("action_cancel")}</button>` : ""}
      </div>
    `;
    for (const [key, val] of Object.entries(form)) {
      const field = formEl.elements[key];
      if (field) field.value = val ?? "";
    }
    const idProofSelect = formEl.elements.idProof;
    const passportExtra = formEl.querySelector(".passport-extra");
    const syncPassportVisibility = () => {
      passportExtra.hidden = idProofSelect.value !== "Passport";
    };
    syncPassportVisibility();
    idProofSelect.addEventListener("change", () => {
      syncPassportVisibility();
      validator.run();
    });

    const validator = liveValidate(formEl, (data) => validatePilgrim(data));

    const cancelBtn = formEl.querySelector("[data-cancel]");
    if (cancelBtn) cancelBtn.addEventListener("click", () => {
      form = emptyPilgrim();
      editingId = null;
      render();
    });

    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(formEl).entries());

      // Block only on hard errors; warnings are informational and still save.
      const check = validator.revealAll();
      if (check.errors.length > 0) {
        showMessage(t("validation_blocked_toast"), "error");
        const firstBad = formEl.querySelector(".invalid");
        if (firstBad) firstBad.focus();
        return;
      }

      if (editingId) {
        pilgrims = pilgrims.map((p) => (p.id === editingId ? { ...p, ...data } : p));
        showMessage(t("msg_pilgrim_updated"));
      } else {
        if (pilgrims.length >= MAX_PILGRIMS) {
          showMessage(t("msg_max_pilgrims"));
          return;
        }
        pilgrims = [...pilgrims, { ...data, id: uid() }];
        showMessage(t("msg_added_pilgrim", { name: data.name }));
      }
      await persistPilgrims();
      form = emptyPilgrim();
      editingId = null;
      render();
    });

    formSection.appendChild(formEl);
    wrap.appendChild(formSection);

  }

  async function onFillOne(pilgrim) {
    const check = validatePilgrim(pilgrim);
    if (check.errors.length > 0) {
      showMessage(check.errors[0].message, "error");
      return;
    }
    try {
      const response = await sendToActiveTab({ action: "AUTOFILL", data: { pilgrim, contact: deriveContact([pilgrim, ...pilgrims]) } });
      const errorMsg = describeFillResult(response, t);
      showMessage(errorMsg || t("msg_filled"), errorMsg ? "error" : "success");
    } catch (err) {
      showMessage(describeThrownError(err, t), "error");
    }
  }

  async function onFillAll() {
    if (pilgrims.length === 0) return;
    // Filling a form with an invalid Aadhaar wastes a booking attempt, so stop
    // here rather than letting the TTD site reject it a step later.
    const broken = pilgrims.filter((p) => validatePilgrim(p).errors.length > 0);
    if (broken.length > 0) {
      showMessage(t("validation_incomplete_pilgrims", { count: broken.length }), "error");
      return;
    }
    try {
      const response = await sendToActiveTab({ action: "FILL_ALL", data: { pilgrims, contact: deriveContact(pilgrims) } });
      const errorMsg = describeFillResult(response, t);
      showMessage(errorMsg || t("msg_all_filled"), errorMsg ? "error" : "success");
    } catch (err) {
      showMessage(describeThrownError(err, t), "error");
    }
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  render();
}
