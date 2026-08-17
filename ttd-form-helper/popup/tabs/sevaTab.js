import { STORAGE_KEYS } from "../../shared/storage.js";
import { secureGet as storageGet, secureSet as storageSet } from "../../shared/secureStore.js";
import { sendToActiveTab, describeFillResult, describeThrownError } from "../../shared/messaging.js";
import { t } from "../../shared/i18n.js";
import { showMessage } from "../toast.js";
import { buildSevaFieldsForm } from "./sevaFields.js";
import { DEFAULT_SEVAK } from "../../shared/formData.js";
import { validateSevak } from "../../shared/validation.js";
import { buildIssueList } from "../../shared/formValidation.js";

export async function renderSevaTab(container) {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "seva-container";
  container.appendChild(wrap);

  const stored = (await storageGet([STORAGE_KEYS.sevakData]))[STORAGE_KEYS.sevakData];
  const data = { ...DEFAULT_SEVAK, ...(stored || {}) };
  if (!data.idType) data.idType = "Aadhaar Card";

  let saveTimer = null;
  const scheduleAutosave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => storageSet({ [STORAGE_KEYS.sevakData]: data }), 500);
  };

  function render() {
    wrap.innerHTML = "";

    const fillSection = document.createElement("div");
    fillSection.className = "fill-all-section";
    const fillBtn = document.createElement("button");
    fillBtn.type = "button";
    fillBtn.className = "btn-fill-all";
    fillBtn.textContent = t("seva_apply_to_form");
    fillBtn.addEventListener("click", onFill);
    fillSection.appendChild(fillBtn);

    const check = validateSevak(data);
    const issues = buildIssueList(check);
    if (issues) fillSection.appendChild(issues);

    if (data.spvrName || data.sevakName) {
      const savedLabel = document.createElement("div");
      savedLabel.style.cssText = "font-size:12px;color:var(--text-secondary);margin:12px 0 6px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;";
      savedLabel.textContent = t("seva_saved_info");
      fillSection.appendChild(savedLabel);

      const card = document.createElement("div");
      card.className = "pilgrim-card";
      card.style.cssText = "border-left:4px solid var(--gold);margin:0;";
      const bits1 = [data.age ? `${data.age} ${t("unit_years")}` : "", data.gender, data.maritalStatus].filter(Boolean).join(" • ");
      const bits2 = [data.mobileNo ? `📱 ${data.mobileNo}` : "", data.email].filter(Boolean).join(" • ");
      const bits3 = [data.idType, data.idNumber].filter(Boolean).join(" • ");
      card.innerHTML = `<div class="pilgrim-info"><strong>${escapeHtml(data.spvrName || data.sevakName)}</strong>
        <div class="pilgrim-details">${escapeHtml(bits1)}</div>
        <div class="pilgrim-details">${escapeHtml(bits2)}</div>
        <div class="pilgrim-details">${escapeHtml(bits3)}</div></div>
        <div style="font-size:1.2rem;opacity:.8;">✅</div>`;
      fillSection.appendChild(card);
    }
    wrap.appendChild(fillSection);

    const formEl = document.createElement("form");
    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      await storageSet({ [STORAGE_KEYS.sevakData]: data });
      showMessage(t("msg_sevak_saved"));
    });
    const fieldsEl = buildSevaFieldsForm({ data, onNotify: scheduleAutosave, showMessage: (m) => showMessage(m, "warn") });
    formEl.appendChild(fieldsEl);

    const actions = document.createElement("div");
    actions.className = "seva-actions";
    const saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn-primary";
    saveBtn.textContent = t("seva_save_data");
    actions.appendChild(saveBtn);
    formEl.appendChild(actions);

    wrap.appendChild(formEl);
  }

  async function onFill() {
    const check = validateSevak(data);
    if (check.errors.length > 0) {
      showMessage(t("validation_blocked_toast"), "error");
      return;
    }
    try {
      const response = await sendToActiveTab({ action: "FILL_SEVA", data: { sevakData: data } });
      const errorMsg = describeFillResult(response, t);
      showMessage(errorMsg || t("msg_form_filled"), errorMsg ? "error" : "success");
    } catch (err) {
      showMessage(describeThrownError(err, t), "error");
    }
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  render();
}
