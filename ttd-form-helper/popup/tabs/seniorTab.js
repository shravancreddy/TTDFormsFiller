// Senior Citizen darshan (TTD's PLD flow, category "sc").
//
// The pilgrims are the same "Pilgrims for this booking" list the 🛕 tab edits:
// the first is the senior citizen, the second (optional) their spouse. What this
// tab adds is the one thing that flow needs and no other does: the Aadhaar age
// proof, stored here once and attached to the page's "Upload Document" field on
// every fill.
//
// TTD's own limits, read from its page code: the first pilgrim must be 65-150,
// only the spouse may come as the second, and the file must be PDF / PNG / JPEG
// of at most 1,024,000 bytes (the site rejects `size > 1024e3`).
import { STORAGE_KEYS } from "../../shared/storage.js";
import { secureGet as storageGet, secureSet as storageSet } from "../../shared/secureStore.js";
import { storageRemove } from "../../shared/storage.js";
import { sendToActiveTab, describeFillResult, describeThrownError } from "../../shared/messaging.js";
import { deriveContact } from "../../shared/pilgrimForm.js";
import { api } from "../../shared/browser.js";
import { t } from "../../shared/i18n.js";
import { showMessage } from "../toast.js";
import { buildIssueList } from "../../shared/formValidation.js";

const BOOKING_URL = "https://ttdevasthanams.ap.gov.in/pld/slot-booking?flow=pld&flowIdentifier=pld";
const MIN_AGE = 65;
const MAX_PILGRIMS = 2;
export const SENIOR_PROOF_MAX = 1024000;

// By content, not by name: a renamed .docx would pass the file picker's
// accept= filter and only fail at the TTD counter.
export function sniffProofType(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return "";
}

const kb = (n) => Math.round(n / 1024) + " KB";

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

export async function renderSeniorTab(container) {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "seva-container";
  container.appendChild(wrap);

  let pilgrims = [];
  let proof = null;

  async function load() {
    const stored = await storageGet([STORAGE_KEYS.pilgrims, STORAGE_KEYS.seniorProof]);
    pilgrims = Array.isArray(stored[STORAGE_KEYS.pilgrims]) ? stored[STORAGE_KEYS.pilgrims] : [];
    proof = stored[STORAGE_KEYS.seniorProof] || null;
  }

  const named = () => pilgrims.filter((p) => p && p.name && String(p.name).trim());

  function problems() {
    const list = named();
    const out = [];
    if (!list.length) out.push(t("senior_need_pilgrim"));
    const first = list[0];
    const age = first ? parseInt(first.age, 10) : NaN;
    if (first && (!isFinite(age) || age < MIN_AGE)) out.push(t("senior_age_too_low", { name: first.name, age: first.age || "?", min: MIN_AGE }));
    if (list.length > MAX_PILGRIMS) out.push(t("senior_too_many", { count: list.length }));
    if (!proof) out.push(t("senior_no_proof"));
    return out;
  }

  function render() {
    wrap.innerHTML = "";

    // ---- fill actions ----
    const fillSection = document.createElement("div");
    fillSection.className = "fill-all-section";
    const fillBtn = document.createElement("button");
    fillBtn.type = "button";
    fillBtn.className = "btn-fill-all";
    fillBtn.textContent = t("senior_fill");
    fillBtn.disabled = named().length === 0;
    fillBtn.addEventListener("click", () => onFill(false));
    const contBtn = document.createElement("button");
    contBtn.type = "button";
    contBtn.className = "btn-secondary";
    contBtn.textContent = t("senior_fill_continue");
    contBtn.disabled = named().length === 0;
    contBtn.addEventListener("click", () => onFill(true));
    const link = document.createElement("a");
    link.href = BOOKING_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "booking-link-small";
    link.textContent = t("open_booking_page");
    fillSection.appendChild(fillBtn);
    fillSection.appendChild(contBtn);
    fillSection.appendChild(link);
    const issues = problems();
    const box = buildIssueList({ errors: [], warnings: issues.map((message) => ({ message })) }, { title: t("senior_check_title") });
    if (box) {
      box.setAttribute("data-senior-issues", "");
      fillSection.appendChild(box);
    }
    wrap.appendChild(fillSection);

    // ---- who is booked ----
    const who = document.createElement("section");
    who.className = "pilgrims-section";
    const h = document.createElement("h2");
    h.textContent = t("senior_pilgrims_heading");
    who.appendChild(h);
    const list = named();
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = t("senior_no_pilgrims");
      who.appendChild(empty);
    } else {
      list.slice(0, MAX_PILGRIMS).forEach((p, i) => {
        const card = document.createElement("div");
        card.className = "pilgrim-card";
        const info = document.createElement("div");
        info.className = "pilgrim-info";
        const nameLine = document.createElement("strong");
        nameLine.textContent = p.name + " · " + (i === 0 ? t("senior_role_senior") : t("senior_role_spouse"));
        const detail = document.createElement("div");
        detail.className = "pilgrim-details";
        detail.textContent = t("pilgrim_details_line", { age: p.age, gender: p.gender, idProof: p.idProof });
        info.appendChild(nameLine);
        info.appendChild(detail);
        card.appendChild(info);
        who.appendChild(card);
      });
    }
    const hint = document.createElement("p");
    hint.className = "pilgrim-details";
    hint.textContent = t("senior_pilgrims_hint");
    who.appendChild(hint);
    wrap.appendChild(who);

    // ---- age proof ----
    const proofSection = document.createElement("section");
    proofSection.className = "form-section";
    const ph = document.createElement("h3");
    ph.textContent = t("senior_proof_heading");
    proofSection.appendChild(ph);
    const status = document.createElement("div");
    status.className = "pilgrim-details";
    status.setAttribute("data-senior-proof", proof ? "saved" : "none");
    status.textContent = proof
      ? t("senior_proof_saved", { name: proof.name, type: String(proof.type || "").split("/")[1] || "?", size: kb(proof.size || 0), when: proof.savedAt ? new Date(proof.savedAt).toLocaleString() : "" })
      : t("senior_proof_none");
    proofSection.appendChild(status);

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";
    input.hidden = true;
    input.setAttribute("data-senior-file", "");
    input.addEventListener("change", async () => {
      const f = input.files && input.files[0];
      input.value = "";
      if (!f) return;
      if (f.size > SENIOR_PROOF_MAX) {
        showMessage(t("senior_proof_too_big", { name: f.name, size: kb(f.size) }), "error");
        return;
      }
      const type = sniffProofType(new Uint8Array(await f.slice(0, 8).arrayBuffer()));
      if (!type) {
        showMessage(t("senior_proof_bad_type", { name: f.name }), "error");
        return;
      }
      try {
        const data = await readAsDataUrl(new Blob([f], { type }));
        proof = { data, name: f.name, type, size: f.size, savedAt: Date.now() };
        await storageSet({ [STORAGE_KEYS.seniorProof]: proof });
        showMessage(t("senior_proof_stored", { name: f.name }));
      } catch (err) {
        showMessage(t("msg_autofill_failed_reason", { reason: (err && err.message) || String(err) }), "error");
      }
      render();
    });
    const actions = document.createElement("div");
    actions.className = "form-actions";
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "btn-primary";
    pick.textContent = proof ? t("senior_proof_replace") : t("senior_proof_choose");
    pick.addEventListener("click", () => input.click());
    actions.appendChild(pick);
    if (proof) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn-secondary";
      del.textContent = t("senior_proof_remove");
      del.addEventListener("click", async () => {
        await storageRemove([STORAGE_KEYS.seniorProof]);
        proof = null;
        showMessage(t("senior_proof_removed"));
        render();
      });
      actions.appendChild(del);
    }
    proofSection.appendChild(actions);
    proofSection.appendChild(input);
    const note = document.createElement("p");
    note.className = "pilgrim-details";
    note.textContent = t("senior_proof_note");
    proofSection.appendChild(note);
    wrap.appendChild(proofSection);
  }

  async function onFill(thenContinue) {
    const list = named();
    if (!list.length) {
      showMessage(t("senior_need_pilgrim"), "error");
      return;
    }
    try {
      const response = await sendToActiveTab({
        action: "FILL_SENIOR",
        data: { pilgrims: list.slice(0, MAX_PILGRIMS), contact: deriveContact(pilgrims), proof, thenContinue },
      });
      const err = describeFillResult(response, t);
      if (err) {
        showMessage(err, "error");
        return;
      }
      const state = response && response.proofState;
      if (state === "attached") showMessage(t("senior_filled_attached", { count: response.filled || 0 }));
      else if (state === "missing") showMessage(t("senior_filled_no_proof", { count: response.filled || 0 }), "error");
      else if (state === "failed" || state === "too_big") showMessage(t("senior_filled_proof_failed", { count: response.filled || 0 }), "error");
      else showMessage(t("senior_filled", { count: response ? response.filled || 0 : 0 }));
    } catch (e) {
      showMessage(describeThrownError(e, t), "error");
    }
  }

  await load();
  render();

  // Stay in step with the 🛕 tab and Settings, which edit the same pilgrim list.
  const onChanged = async (changes, area) => {
    if (area !== "local") return;
    if (!changes[STORAGE_KEYS.pilgrims] && !changes[STORAGE_KEYS.seniorProof]) return;
    if (!wrap.isConnected) {
      api.storage.onChanged.removeListener(onChanged);
      return;
    }
    try {
      await load();
      render();
    } catch {}
  };
  api.storage.onChanged.addListener(onChanged);
}
