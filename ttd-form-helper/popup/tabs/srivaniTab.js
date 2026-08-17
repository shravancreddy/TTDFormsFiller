import { STORAGE_KEYS, uid } from "../../shared/storage.js";
import { secureGet as storageGet, secureSet as storageSet } from "../../shared/secureStore.js";
import { sendToActiveTab, describeFillResult, describeThrownError } from "../../shared/messaging.js";
import { t } from "../../shared/i18n.js";
import { showMessage } from "../toast.js";
import { createVaultPicker } from "./vaultPicker.js";
import { validatePilgrim } from "../../shared/validation.js";
import { liveValidate, buildBadge, buildIssueList } from "../../shared/formValidation.js";

const MAX_PEOPLE = 9;
const BOOKING_URL = "https://tirupatibalaji.ap.gov.in/#/srivaniedonations";
const emptyPerson = () => ({ name: "", age: "", gender: "", idProof: "Aadhaar Card", idNumber: "" });

export async function renderSrivaniTab(container) {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "seva-container";
  container.appendChild(wrap);

  let people = ((await storageGet([STORAGE_KEYS.srivaniPeople]))[STORAGE_KEYS.srivaniPeople]) || [];
  let editingId = null;
  let form = emptyPerson();

  const persist = () => storageSet({ [STORAGE_KEYS.srivaniPeople]: people });

  function render() {
    wrap.innerHTML = "";

    const fillSection = document.createElement("div");
    fillSection.className = "fill-all-section";
    const fillBtn = document.createElement("button");
    fillBtn.type = "button";
    fillBtn.className = "btn-fill-all";
    fillBtn.textContent = t("srivani_fill_all");
    fillBtn.disabled = people.length === 0;
    fillBtn.addEventListener("click", onFillAll);
    const link = document.createElement("a");
    link.href = BOOKING_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "booking-link-small";
    link.textContent = t("open_booking_page");
    fillSection.appendChild(fillBtn);
    fillSection.appendChild(link);
    const blocking = people
      .map((p) => ({ person: p, result: validatePilgrim(p) }))
      .filter((x) => x.result.errors.length > 0);
    if (blocking.length > 0) {
      const combined = {
        errors: blocking.flatMap((x) =>
          x.result.errors.map((e) => ({ field: e.field, message: `${x.person.name || t("vault_unnamed")}: ${e.message}` }))
        ),
        warnings: [],
      };
      const list = buildIssueList(combined);
      if (list) fillSection.appendChild(list);
    }
    wrap.appendChild(fillSection);

    const section = document.createElement("section");
    section.className = "pilgrims-section";
    const heading = document.createElement("h2");
    heading.textContent = t("srivani_people_heading", { count: people.length, max: MAX_PEOPLE });
    section.appendChild(heading);

    if (people.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = t("srivani_no_people");
      section.appendChild(empty);
    } else {
      people.forEach((p) => {
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
        const editBtn = document.createElement("button");
        editBtn.textContent = "✏️";
        editBtn.addEventListener("click", () => {
          form = { ...emptyPerson(), ...p };
          editingId = p.id;
          render();
        });
        const delBtn = document.createElement("button");
        delBtn.className = "btn-delete";
        delBtn.textContent = "🗑️";
        delBtn.addEventListener("click", async () => {
          people = people.filter((x) => x.id !== p.id);
          await persist();
          showMessage(t("msg_person_deleted"));
          render();
        });
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        card.appendChild(info);
        card.appendChild(actions);
        section.appendChild(card);
      });
    }

    const vaultPicker = createVaultPicker({
      isAdded: (entry) => people.some((p) => p.vaultId === entry.id),
      isDisabled: () => people.length >= MAX_PEOPLE,
      onAdd: async (entry) => {
        if (people.length >= MAX_PEOPLE) {
          showMessage(t("msg_max_people", { count: MAX_PEOPLE }));
          return;
        }
        people = [...people, { ...emptyPerson(), ...entry, id: uid(), vaultId: entry.id }];
        await persist();
        showMessage(t("msg_added_person", { name: entry.name || t("noun_person") }));
        render();
      },
    });
    section.appendChild(vaultPicker.el);
    wrap.appendChild(section);

    const formSection = document.createElement("section");
    formSection.className = "form-section";
    const formHeading = document.createElement("h3");
    formHeading.textContent = t(editingId ? "srivani_edit_person" : "srivani_add_person");
    formSection.appendChild(formHeading);

    const formEl = document.createElement("form");
    formEl.innerHTML = `
      <div class="form-row">
        <div class="form-group"><label>${t("srivani_field_name")}</label><input name="name" required placeholder="${t("srivani_field_name_placeholder")}" /></div>
        <div class="form-group"><label>${t("field_age")}</label><input name="age" type="number" required placeholder="${t("srivani_field_age_placeholder")}" /></div>
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
        <div class="form-group"><label>${t("srivani_field_id_type")}</label>
          <select name="idProof">
            <option value="Aadhaar Card">${t("idproof_aadhaar")}</option>
            <option value="Passport">${t("idproof_passport")}</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label>${t("srivani_field_id_number")}</label><input name="idNumber" required placeholder="${t("srivani_field_id_number_placeholder")}" /></div>
      <div class="form-actions">
        <button type="submit" class="btn-primary" ${people.length >= MAX_PEOPLE && !editingId ? "disabled" : ""}>${t(editingId ? "srivani_update_person" : "srivani_add_person")}</button>
        ${editingId ? `<button type="button" class="btn-secondary" data-cancel>${t("action_cancel")}</button>` : ""}
      </div>
    `;
    for (const [key, val] of Object.entries(form)) {
      const field = formEl.elements[key];
      if (field) field.value = val ?? "";
    }
    const validator = liveValidate(formEl, (data) => validatePilgrim(data));
    formEl.elements.idProof.addEventListener("change", () => validator.run());

    const cancelBtn = formEl.querySelector("[data-cancel]");
    if (cancelBtn) cancelBtn.addEventListener("click", () => {
      form = emptyPerson();
      editingId = null;
      render();
    });
    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(formEl).entries());
      const check = validator.revealAll();
      if (check.errors.length > 0) {
        showMessage(t("validation_blocked_toast"), "error");
        const firstBad = formEl.querySelector(".invalid");
        if (firstBad) firstBad.focus();
        return;
      }
      if (editingId) {
        people = people.map((p) => (p.id === editingId ? { ...p, ...data } : p));
        showMessage(t("msg_person_updated"));
      } else {
        if (people.length >= MAX_PEOPLE) {
          showMessage(t("msg_max_people", { count: MAX_PEOPLE }));
          return;
        }
        people = [...people, { ...data, id: uid() }];
        showMessage(t("msg_person_added"));
      }
      await persist();
      form = emptyPerson();
      editingId = null;
      render();
    });

    formSection.appendChild(formEl);
    wrap.appendChild(formSection);
  }

  async function onFillAll() {
    if (people.length === 0) {
      showMessage(t("msg_add_person_first"));
      return;
    }
    const broken = people.filter((p) => validatePilgrim(p).errors.length > 0);
    if (broken.length > 0) {
      showMessage(t("validation_incomplete_pilgrims", { count: broken.length }), "error");
      return;
    }
    try {
      const response = await sendToActiveTab({ action: "FILL_SRIVANI", data: { members: people } });
      const errorMsg = describeFillResult(response, t);
      showMessage(errorMsg || t("msg_srivani_filled"), errorMsg ? "error" : "success");
    } catch (err) {
      showMessage(describeThrownError(err, t), "error");
    }
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  render();
}
