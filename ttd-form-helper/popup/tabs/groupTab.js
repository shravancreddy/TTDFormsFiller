import { STORAGE_KEYS } from "../../shared/storage.js";
import { secureGet as storageGet, secureSet as storageSet } from "../../shared/secureStore.js";
import { sendToActiveTab, describeFillResult, describeThrownError } from "../../shared/messaging.js";
import { t } from "../../shared/i18n.js";
import { showMessage } from "../toast.js";
import { buildSevaFieldsForm } from "./sevaFields.js";
import { DEFAULT_SEVAK } from "../../shared/formData.js";
import { validateSevak } from "../../shared/validation.js";
import { buildIssueList, buildBadge } from "../../shared/formValidation.js";

const MAX_MEMBERS = 15;
const DEFAULT_VISIBLE = 10;
const ADDRESS_FIELDS = ["residentialAdrs", "pincode", "state", "district", "city", "street", "doorNo"];

export async function renderGroupTab(container) {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "seva-container group-container";
  container.appendChild(wrap);

  const stored = await storageGet([STORAGE_KEYS.groupSevaData, STORAGE_KEYS.groupVisibleCount]);
  const members = Array.from({ length: MAX_MEMBERS }, (_, i) => {
    const saved = (stored[STORAGE_KEYS.groupSevaData] || [])[i];
    const merged = { ...DEFAULT_SEVAK, ...(saved || {}) };
    if (!merged.idType) merged.idType = "Aadhaar Card";
    return merged;
  });
  let visibleCount = stored[STORAGE_KEYS.groupVisibleCount] || DEFAULT_VISIBLE;
  if (visibleCount < DEFAULT_VISIBLE || visibleCount > MAX_MEMBERS) visibleCount = DEFAULT_VISIBLE;

  let activeIndex = 0;
  let jumpToMember = 1;
  let saveTimer = null;

  const persistVisible = () => storageSet({ [STORAGE_KEYS.groupVisibleCount]: visibleCount });
  const scheduleAutosave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => storageSet({ [STORAGE_KEYS.groupSevaData]: members }), 500);
  };

  function render() {
    wrap.innerHTML = "";

    // fill-by-number control
    const controls = document.createElement("div");
    controls.className = "group-controls";
    const fillControl = document.createElement("div");
    fillControl.className = "fill-control";
    fillControl.innerHTML = `<label>${t("group_fill_member")}</label>`;
    const group = document.createElement("div");
    group.className = "fill-input-group";
    const numberInput = document.createElement("input");
    numberInput.type = "number";
    numberInput.min = "1";
    numberInput.max = String(MAX_MEMBERS);
    numberInput.className = "member-input";
    numberInput.value = String(jumpToMember);
    numberInput.addEventListener("input", () => {
      jumpToMember = parseInt(numberInput.value, 10) || 1;
    });
    const jumpFillBtn = document.createElement("button");
    jumpFillBtn.type = "button";
    jumpFillBtn.className = "btn-fill-all";
    jumpFillBtn.textContent = "⚡ Fill";
    jumpFillBtn.addEventListener("click", onJumpFill);
    group.appendChild(numberInput);
    group.appendChild(jumpFillBtn);
    fillControl.appendChild(group);
    controls.appendChild(fillControl);
    wrap.appendChild(controls);

    const layout = document.createElement("div");
    layout.className = "group-layout";

    // sidebar
    const sidebar = document.createElement("div");
    sidebar.className = "group-sidebar";
    const sidebarHeader = document.createElement("div");
    sidebarHeader.className = "sidebar-header";
    sidebarHeader.textContent = t("sidebar_members");
    sidebar.appendChild(sidebarHeader);

    const membersList = document.createElement("div");
    membersList.className = "members-list";
    for (let i = 0; i < visibleCount; i++) {
      const memberRow = document.createElement("div");
      memberRow.className = "member-row";

      const itemBtn = document.createElement("button");
      itemBtn.className = "member-item" + (i === activeIndex ? " active" : "");
      itemBtn.innerHTML = `<span class="member-num">#${i + 1}</span><span class="member-name">${escapeHtml(members[i].sevakName || t(i === 0 ? "team_leader" : "team_member"))}</span>`;
      // Only flag members the user has actually started filling in.
      if (members[i].sevakName || members[i].idNumber) {
        const memberCheck = validateSevak(members[i]);
        if (memberCheck.errors.length > 0) {
          const dot = document.createElement("span");
          dot.className = "member-flag";
          dot.textContent = "⛔";
          dot.title = memberCheck.errors.map((e) => e.message).join("\n");
          itemBtn.appendChild(dot);
        }
      }
      itemBtn.addEventListener("click", () => {
        activeIndex = i;
        render();
      });

      const reorder = document.createElement("div");
      reorder.className = "member-reorder";
      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "reorder-btn";
      upBtn.textContent = "▲";
      upBtn.title = t("move_up");
      upBtn.disabled = i === 0;
      upBtn.addEventListener("click", () => swapMembers(i, i - 1));
      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "reorder-btn";
      downBtn.textContent = "▼";
      downBtn.title = t("move_down");
      downBtn.disabled = i === visibleCount - 1;
      downBtn.addEventListener("click", () => swapMembers(i, i + 1));
      reorder.appendChild(upBtn);
      reorder.appendChild(downBtn);

      memberRow.appendChild(itemBtn);
      memberRow.appendChild(reorder);
      membersList.appendChild(memberRow);
    }
    if (visibleCount < MAX_MEMBERS) {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "member-item add-member-btn";
      addBtn.style.cssText = "justify-content:center;color:var(--primary);font-weight:600;font-size:12px;";
      addBtn.textContent = t("group_add_member");
      addBtn.addEventListener("click", async () => {
        visibleCount++;
        await persistVisible();
        render();
      });
      membersList.appendChild(addBtn);
    }
    if (visibleCount > DEFAULT_VISIBLE) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "member-item";
      removeBtn.style.cssText = "justify-content:center;color:var(--danger);font-weight:600;font-size:12px;";
      removeBtn.textContent = t("group_remove_member");
      removeBtn.addEventListener("click", async () => {
        const lastIndex = visibleCount - 1;
        if (activeIndex >= lastIndex) activeIndex = Math.max(0, lastIndex - 1);
        members[lastIndex] = { ...DEFAULT_SEVAK, idType: "Aadhaar Card" };
        visibleCount--;
        await persistVisible();
        scheduleAutosave();
        render();
      });
      membersList.appendChild(removeBtn);
    }
    sidebar.appendChild(membersList);
    layout.appendChild(sidebar);

    // form area
    const formArea = document.createElement("div");
    formArea.className = "group-form-area";
    const headerActions = document.createElement("div");
    headerActions.className = "form-header-actions";
    const h3 = document.createElement("h3");
    h3.textContent = activeIndex === 0 ? t("team_leader") : t("team_member_n", { n: activeIndex + 1 });
    headerActions.appendChild(h3);
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn-secondary btn-sm";
    if (activeIndex === 0) {
      copyBtn.textContent = t("group_copy_to_all");
      copyBtn.addEventListener("click", () => {
        const leader = members[0];
        for (let i = 1; i < MAX_MEMBERS; i++) {
          ADDRESS_FIELDS.forEach((f) => (members[i][f] = leader[f]));
        }
        scheduleAutosave();
        showMessage(t("msg_address_copied_to_all"));
        render();
      });
    } else {
      copyBtn.textContent = t("group_copy_from_leader");
      copyBtn.addEventListener("click", () => {
        const leader = members[0];
        ADDRESS_FIELDS.forEach((f) => (members[activeIndex][f] = leader[f]));
        scheduleAutosave();
        showMessage(t("msg_address_copied_from"));
        render();
      });
    }
    headerActions.appendChild(copyBtn);
    formArea.appendChild(headerActions);

    const active = members[activeIndex];
    if (active.spvrName) {
      const savedLabel = document.createElement("div");
      savedLabel.style.cssText = "font-size:11px;color:var(--text-secondary);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;";
      savedLabel.textContent = t("seva_saved_info");
      const card = document.createElement("div");
      card.className = "pilgrim-card";
      card.style.cssText = "border-left:4px solid var(--gold);margin:0 0 16px;";
      const bits = [active.age ? `${active.age} yrs` : "", active.gender, active.idType].filter(Boolean).join(" • ");
      card.innerHTML = `<div class="pilgrim-info"><strong>${escapeHtml(active.spvrName)}</strong><div class="pilgrim-details">${escapeHtml(bits)}</div></div><div style="font-size:1.2rem;opacity:.8;">💾</div>`;
      formArea.appendChild(savedLabel);
      formArea.appendChild(card);
    }

    const formEl = document.createElement("form");
    formEl.addEventListener("submit", (e) => e.preventDefault());
    formEl.appendChild(
      buildSevaFieldsForm({
        data: active,
        onNotify: () => {
          if (activeIndex === 0 && active.nearestTtdTemple) {
            for (let i = 1; i < MAX_MEMBERS; i++) members[i].nearestTtdTemple = active.nearestTtdTemple;
          }
          scheduleAutosave();
        },
        showMessage: (m) => showMessage(m, "warn"),
        isGroup: true,
        isLeader: activeIndex === 0,
      })
    );
    const activeCheck = validateSevak(active);
    if (active.sevakName || active.idNumber) {
      const issues = buildIssueList(activeCheck);
      if (issues) formEl.appendChild(issues);
    }

    const fillMemberBtn = document.createElement("button");
    fillMemberBtn.type = "button";
    fillMemberBtn.className = "btn-fill-member";
    fillMemberBtn.textContent = t("group_fill_member_btn");
    fillMemberBtn.addEventListener("click", () => fillMember(activeIndex));
    formEl.appendChild(fillMemberBtn);

    const note = document.createElement("div");
    note.style.cssText = "text-align:center;padding:12px 0;font-size:12px;color:var(--text-muted);font-style:italic;";
    note.textContent = t("group_autosave_note");
    formEl.appendChild(note);

    formArea.appendChild(formEl);
    layout.appendChild(formArea);
    wrap.appendChild(layout);
  }

  function swapMembers(a, b) {
    if (b < 0 || b >= visibleCount) return;
    [members[a], members[b]] = [members[b], members[a]];
    if (activeIndex === a) activeIndex = b;
    else if (activeIndex === b) activeIndex = a;
    scheduleAutosave();
    render();
  }

  async function fillMember(index) {
    const check = validateSevak(members[index]);
    if (check.errors.length > 0) {
      showMessage(t("validation_blocked_toast"), "error");
      return false;
    }
    const memberData = { ...members[index], memberIndex: index };
    try {
      const response = await sendToActiveTab({ action: "FILL_SEVA", data: { sevakData: memberData } });
      const errorMsg = describeFillResult(response, t);
      if (errorMsg) {
        showMessage(errorMsg, "error");
        return false;
      }
      showMessage(t("msg_filled_member", { n: index + 1 }), "success");
      if (index < MAX_MEMBERS - 1 && index + 1 >= visibleCount) {
        visibleCount = index + 2;
        await persistVisible();
      }
      return true;
    } catch (err) {
      showMessage(describeThrownError(err, t), "error");
      return false;
    }
  }

  async function onJumpFill() {
    const index = jumpToMember - 1;
    if (index < 0 || index >= MAX_MEMBERS) {
      showMessage(t("msg_invalid_member"));
      return;
    }
    activeIndex = index;
    showMessage(t("msg_autofilling_member", { n: index + 1 }));
    const ok = await fillMember(index);
    if (!ok) showMessage(t("msg_error_autofilling_member", { n: index + 1 }), "error");
    render();
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  render();
}
