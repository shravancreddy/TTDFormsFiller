import { STORAGE_KEYS, uid } from "../../shared/storage.js";
import { secureGet as storageGet, secureSet as storageSet } from "../../shared/secureStore.js";
import { sendToActiveTab, describeFillResult, describeThrownError } from "../../shared/messaging.js";
import { t } from "../../shared/i18n.js";
import { api } from "../../shared/browser.js";
import { showMessage } from "../toast.js";
import { createVaultPicker } from "./vaultPicker.js";
import { validatePilgrim } from "../../shared/validation.js";
import { buildBadge, buildIssueList } from "../../shared/formValidation.js";
import { buildPilgrimForm, emptyPilgrim, deriveContact, CONTACT_FIELDS } from "../../shared/pilgrimForm.js";

const MAX_PILGRIMS = 6;

// Switching tabs re-runs the renderer, so the previous run's storage listener
// is dropped before a new one is attached — otherwise they'd stack up and the
// tab would repaint once per past visit.
let detachStorageWatch = null;

export async function renderPilgrimTab(container) {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "seva-container";
  container.appendChild(wrap);

  let pilgrims = [];
  let vault = [];
  let sets = [];
  let editingId = null;
  let form = emptyPilgrim();

  async function loadAll() {
    const stored = await storageGet([STORAGE_KEYS.pilgrims, STORAGE_KEYS.contact, STORAGE_KEYS.vault, STORAGE_KEYS.sets]);
    pilgrims = Array.isArray(stored[STORAGE_KEYS.pilgrims]) ? stored[STORAGE_KEYS.pilgrims] : [];
    vault = Array.isArray(stored[STORAGE_KEYS.vault]) ? stored[STORAGE_KEYS.vault] : [];
    sets = Array.isArray(stored[STORAGE_KEYS.sets]) ? stored[STORAGE_KEYS.sets] : [];
    return stored;
  }

  const stored = await loadAll();

  // The derived contact is still written to its own storage key: the content
  // script, the background worker's secure read, and backup/restore all read
  // it, and keeping it in sync means none of them need to know it moved.
  const persistPilgrims = () =>
    storageSet({
      [STORAGE_KEYS.pilgrims]: pilgrims,
      [STORAGE_KEYS.contact]: deriveContact(pilgrims),
    });

  /**
   * Saved pilgrims are the master list of people, so anyone added or edited
   * here is written straight back to it — no separate "also save this" step.
   * Returns the vault id the pilgrim is now linked to.
   */
  async function upsertVault(pilgrim) {
    const now = new Date().toISOString();
    const { id, vaultId, ...fields } = pilgrim;
    const index = vaultId ? vault.findIndex((v) => v.id === vaultId) : -1;
    let linkedId = vaultId;
    if (index >= 0) {
      vault = vault.map((v, i) => (i === index ? { ...v, ...fields, updatedAt: now } : v));
    } else {
      linkedId = uid();
      vault = [...vault, { ...fields, id: linkedId, createdAt: now, updatedAt: now }];
    }
    await storageSet({ [STORAGE_KEYS.vault]: vault });
    return linkedId;
  }

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

  // Settings and the panel edit the same records, so a change made in one shows
  // up in the other without either being reopened.
  const watchedKeys = [STORAGE_KEYS.pilgrims, STORAGE_KEYS.vault, STORAGE_KEYS.sets];
  const onStorageChanged = async (changes, area) => {
    if (area !== "local" || !watchedKeys.some((k) => k in changes)) return;
    if (!wrap.isConnected) return; // another tab has replaced this one
    const before = JSON.stringify([pilgrims, vault, sets]);
    await loadAll();
    // Our own writes land here too — only repaint when something really moved,
    // and never while the user is part-way through editing someone.
    if (JSON.stringify([pilgrims, vault, sets]) !== before && !editingId) render();
  };
  if (detachStorageWatch) detachStorageWatch();
  api.storage.onChanged.addListener(onStorageChanged);
  detachStorageWatch = () => {
    try {
      api.storage.onChanged.removeListener(onStorageChanged);
    } catch {}
    detachStorageWatch = null;
  };

  // ------------------------------------------------------------ actions ----
  function actionButton({ icon, label, title, onClick, disabled = false, primary = false }) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-tile" + (primary ? " primary" : "");
    btn.disabled = disabled;
    btn.title = title || label;
    btn.innerHTML = `<span class="action-tile-icon" aria-hidden="true">${icon}</span><span class="action-tile-label"></span>`;
    btn.querySelector(".action-tile-label").textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  async function sendFill(message, successKey) {
    try {
      const response = await sendToActiveTab(message);
      const errorMsg = describeFillResult(response, t);
      showMessage(errorMsg || t(successKey), errorMsg ? "error" : "success");
    } catch (err) {
      showMessage(describeThrownError(err, t), "error");
    }
  }

  function blockedByValidation() {
    const broken = pilgrims.filter((p) => validatePilgrim(p).errors.length > 0);
    if (broken.length === 0) return false;
    showMessage(t("validation_incomplete_pilgrims", { count: broken.length }), "error");
    return true;
  }

  async function onFillAll(thenContinue = false) {
    if (pilgrims.length === 0 || blockedByValidation()) return;
    await sendFill(
      { action: "FILL_ALL", data: { pilgrims, contact: deriveContact(pilgrims), thenContinue } },
      "msg_all_filled"
    );
  }

  async function onFillNext() {
    if (pilgrims.length === 0 || blockedByValidation()) return;
    try {
      const response = await sendToActiveTab({
        action: "FILL_NEXT",
        data: { pilgrims, contact: deriveContact(pilgrims) },
      });
      const errorMsg = describeFillResult(response, t);
      if (errorMsg) {
        showMessage(errorMsg, "error");
        return;
      }
      // Nothing left to place (everyone is on the form already) comes back as a
      // success with nothing filled — say that rather than claiming a fill.
      if (response && response.filled === 0) {
        showMessage(response.message || t("msg_all_filled"), "warn");
        return;
      }
      showMessage(t("msg_filled"), "success");
    } catch (err) {
      showMessage(describeThrownError(err, t), "error");
    }
  }

  async function onClearFields() {
    await sendFill({ action: "CLEAR_FIELDS", data: {} }, "msg_fields_cleared");
  }

  async function onFillOne(pilgrim) {
    const check = validatePilgrim(pilgrim);
    if (check.errors.length > 0) {
      showMessage(check.errors[0].message, "error");
      return;
    }
    await sendFill(
      { action: "AUTOFILL", data: { pilgrim, contact: deriveContact([pilgrim, ...pilgrims]) } },
      "msg_filled"
    );
  }

  // ------------------------------------------------------------- render ----
  function render() {
    wrap.innerHTML = "";

    // Fill actions — icons with legible labels, in the order they're used.
    const fillSection = document.createElement("div");
    fillSection.className = "fill-all-section";
    const actionGrid = document.createElement("div");
    actionGrid.className = "action-grid";
    const noPilgrims = pilgrims.length === 0;
    actionGrid.appendChild(
      actionButton({
        icon: "⚡",
        label: t("action_fill_all"),
        title: t("action_fill_all_title"),
        disabled: noPilgrims,
        primary: true,
        onClick: () => onFillAll(false),
      })
    );
    actionGrid.appendChild(
      actionButton({
        icon: "①",
        label: t("action_fill_next"),
        title: t("action_fill_next_title"),
        disabled: noPilgrims,
        onClick: onFillNext,
      })
    );
    actionGrid.appendChild(
      actionButton({
        icon: "⏭️",
        label: t("action_fill_all_continue"),
        title: t("action_fill_all_continue_title"),
        disabled: noPilgrims,
        onClick: () => onFillAll(true),
      })
    );
    actionGrid.appendChild(
      actionButton({
        icon: "🧹",
        label: t("action_clear_fields"),
        title: t("action_clear_fields_title"),
        onClick: onClearFields,
      })
    );
    fillSection.appendChild(actionGrid);

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
          const members = (s.pilgrimIds || []).map((id) => vault.find((v) => v.id === id)).filter(Boolean);
          if (members.length === 0) {
            showMessage(t("set_no_pilgrims"), "warn");
            return;
          }
          const capped = members.slice(0, MAX_PILGRIMS);
          pilgrims = capped.map((m) => ({ ...emptyPilgrim(), ...m, id: uid(), vaultId: m.id }));
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

        // Keep a booking-only pilgrim for later: copies them into Saved
        // pilgrims so they can be reused and put into sets.
        const linked = p.vaultId && vault.some((v) => v.id === p.vaultId);
        const keepBtn = document.createElement("button");
        keepBtn.textContent = linked ? "⭐" : "☆";
        keepBtn.title = linked ? t("action_in_saved") : t("action_keep_in_saved");
        keepBtn.disabled = !!linked;
        keepBtn.addEventListener("click", async () => {
          const vaultId = await upsertVault(p);
          pilgrims = pilgrims.map((x) => (x.id === p.id ? { ...x, vaultId } : x));
          await persistPilgrims();
          showMessage(t("msg_kept_in_saved", { name: p.name || t("noun_pilgrim") }));
          render();
        });

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
        delBtn.title = t("action_remove_from_booking");
        delBtn.addEventListener("click", async () => {
          pilgrims = pilgrims.filter((x) => x.id !== p.id);
          await persistPilgrims();
          showMessage(t("msg_pilgrim_deleted"));
          render();
        });
        actions.appendChild(fillOneBtn);
        actions.appendChild(keepBtn);
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

    // Add/edit form — the same component the Settings page uses.
    const formSection = document.createElement("section");
    formSection.className = "form-section";
    const formHeading = document.createElement("h3");
    formHeading.textContent = t(editingId ? "action_edit_pilgrim" : "action_add_pilgrim");
    formSection.appendChild(formHeading);

    // Open the contact block by default for the pilgrim whose details will
    // actually be used for the booking (the first one), or when editing
    // someone who already has them — otherwise keep the form compact.
    const isFirstPilgrim = editingId ? pilgrims[0]?.id === editingId : pilgrims.length === 0;

    const { el: formEl } = buildPilgrimForm({
      value: form,
      editing: !!editingId,
      requireIdNumber: true,
      contactOpen: isFirstPilgrim || CONTACT_FIELDS.some((f) => form[f]),
      onInvalid: () => showMessage(t("validation_blocked_toast"), "error"),
      onCancel: editingId
        ? () => {
            form = emptyPilgrim();
            editingId = null;
            render();
          }
        : null,
      onSubmit: async (data) => {
        if (editingId) {
          const existing = pilgrims.find((p) => p.id === editingId);
          const vaultId = await upsertVault({ ...existing, ...data });
          pilgrims = pilgrims.map((p) => (p.id === editingId ? { ...p, ...data, vaultId } : p));
          showMessage(t("msg_pilgrim_updated"));
        } else {
          if (pilgrims.length >= MAX_PILGRIMS) {
            showMessage(t("msg_max_pilgrims"));
            return;
          }
          const vaultId = await upsertVault(data);
          pilgrims = [...pilgrims, { ...data, id: uid(), vaultId }];
          showMessage(t("msg_added_pilgrim", { name: data.name }));
        }
        await persistPilgrims();
        form = emptyPilgrim();
        editingId = null;
        render();
      },
    });

    formSection.appendChild(formEl);
    wrap.appendChild(formSection);
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
  }

  render();
}
