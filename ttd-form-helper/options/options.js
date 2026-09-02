import { STORAGE_KEYS, uid, storageClear } from "../shared/storage.js";
import {
  secureGet as storageGet, secureSet as storageSet,
  getVaultState, enableEncryption, disableEncryption, changePassphrase,
} from "../shared/secureStore.js";
import { initI18n, setLocale, getLocale, t, SUPPORTED_LOCALES, LOCALE_LABELS } from "../shared/i18n.js";
import { encryptBackup, decryptBackup, isEncryptedBackup, passphraseStrength } from "../shared/crypto.js";
import { renderUnlockScreen } from "../shared/unlockScreen.js";
import { validatePilgrim } from "../shared/validation.js";
import { buildBadge } from "../shared/formValidation.js";
import { buildPilgrimForm, emptyPilgrim, CONTACT_FIELDS } from "../shared/pilgrimForm.js";
import { api } from "../shared/browser.js";

const TAB_DEFS = [
  { id: "pilgrim", icon: "🛕", labelKey: "tab_pilgrim" },
  { id: "seva", icon: "🙏", labelKey: "tab_seva" },
  { id: "group", icon: "👥", labelKey: "tab_seva_group" },
  { id: "srivani", icon: "🪔", labelKey: "tab_srivani" },
];
const DEFAULT_TAB_ORDER = TAB_DEFS.map((d) => d.id);

const SCREENS = [
  { id: "vault", icon: "👨‍👩‍👧", labelKey: "opt_nav_vault" },
  { id: "sets", icon: "🗂️", labelKey: "opt_nav_sets" },
  { id: "tabs", icon: "🧭", labelKey: "opt_nav_tabs" },
  { id: "backup", icon: "💾", labelKey: "opt_nav_backup" },
  { id: "security", icon: "🔐", labelKey: "opt_nav_security" },
  { id: "about", icon: "🛡️", labelKey: "opt_nav_about" },
];

function showToast(message, kind = "info") {
  const root = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = "toast" + (kind !== "info" ? " " + kind : "");
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** The "nothing leaves this browser" reassurance card. */
function buildPrivacyCallout() {
  const el = document.createElement("div");
  el.className = "privacy-callout";
  el.setAttribute("role", "note");
  el.innerHTML =
    `<div class="privacy-callout-icon" aria-hidden="true">🔒</div>` +
    `<div class="privacy-callout-body"><strong>${t("privacy_callout_title")}</strong>` +
    `<p>${t("privacy_callout_body")}</p></div>`;
  return el;
}

/**
 * "Why this is safe to use" — each point is a structural property of the
 * extension the user can independently verify, not a promise.
 */
function buildSafetyCard() {
  const POINTS = [
    ["🎯", "opt_safety_sites_title", "opt_safety_sites_body"],
    ["🚫", "opt_safety_network_title", "opt_safety_network_body"],
    ["🔑", "opt_safety_permissions_title", "opt_safety_permissions_body"],
    ["📦", "opt_safety_code_title", "opt_safety_code_body"],
    ["👆", "opt_safety_action_title", "opt_safety_action_body"],
    ["🔍", "opt_safety_verify_title", "opt_safety_verify_body"],
  ];

  const card = document.createElement("div");
  card.className = "opt-card opt-safety-card";

  const heading = document.createElement("h2");
  heading.textContent = "🛡️ " + t("opt_safety_title");
  card.appendChild(heading);

  const intro = document.createElement("p");
  intro.className = "opt-subtitle";
  intro.textContent = t("opt_safety_intro");
  card.appendChild(intro);

  const list = document.createElement("div");
  list.className = "safety-list";
  POINTS.forEach(([icon, titleKey, bodyKey]) => {
    const item = document.createElement("div");
    item.className = "safety-item";

    const iconEl = document.createElement("div");
    iconEl.className = "safety-icon";
    iconEl.setAttribute("aria-hidden", "true");
    iconEl.textContent = icon;

    const textEl = document.createElement("div");
    const titleEl = document.createElement("strong");
    titleEl.textContent = t(titleKey);
    const bodyEl = document.createElement("p");
    bodyEl.textContent = t(bodyKey);
    textEl.appendChild(titleEl);
    textEl.appendChild(bodyEl);

    item.appendChild(iconEl);
    item.appendChild(textEl);
    list.appendChild(item);
  });
  card.appendChild(list);
  return card;
}

async function applyTheme() {
  const stored = (await storageGet([STORAGE_KEYS.theme]))[STORAGE_KEYS.theme];
  if (stored === "light" || stored === "dark") document.documentElement.setAttribute("data-theme", stored);
  else document.documentElement.removeAttribute("data-theme");
}

let activeScreen = "vault";

function renderNav() {
  const nav = document.getElementById("opt-nav");
  nav.innerHTML = "";
  SCREENS.forEach((s) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "opt-nav-btn" + (s.id === activeScreen ? " active" : "");
    btn.innerHTML = `<span>${s.icon}</span><span>${t(s.labelKey).replace(/^\S+\s/, "")}</span>`;
    btn.addEventListener("click", () => switchScreen(s.id));
    nav.appendChild(btn);
  });
}

async function switchScreen(id) {
  activeScreen = id;
  renderNav();
  const main = document.getElementById("opt-main");
  main.innerHTML = "";
  const renderers = {
    vault: renderVaultScreen, sets: renderSetsScreen, tabs: renderTabsScreen,
    backup: renderBackupScreen, security: renderSecurityScreen, about: renderAboutScreen,
  };
  await renderers[id](main);
}

// ---------------------------------------------------------------- Vault ----
// Saved pilgrims and the panel's booking list are the same kind of record and
// share one form component, so neither can drift into having fields the other
// is missing (which is how Saved pilgrims ended up with no contact details).
const emptyVaultEntry = emptyPilgrim;

async function renderVaultScreen(main) {
  let vault = (await storageGet([STORAGE_KEYS.vault]))[STORAGE_KEYS.vault] || [];
  let editingId = null;
  let form = emptyVaultEntry();

  const screen = document.createElement("div");
  screen.className = "opt-screen";
  screen.innerHTML = `<h1>${t("opt_nav_vault").replace(/^\S+\s/, "")}</h1><p class="opt-subtitle">${t("opt_vault_subtitle")}</p>`;
  main.appendChild(screen);
  screen.appendChild(buildPrivacyCallout());

  const listCard = document.createElement("div");
  listCard.className = "opt-card";
  screen.appendChild(listCard);

  const formCard = document.createElement("div");
  formCard.className = "opt-card";
  screen.appendChild(formCard);

  function renderList() {
    listCard.innerHTML = `<h2>${t("opt_nav_vault").replace(/^\S+\s/, "")} (${vault.length})</h2>`;
    if (vault.length === 0) {
      const empty = document.createElement("div");
      empty.className = "opt-empty";
      empty.textContent = t("opt_vault_empty");
      listCard.appendChild(empty);
      return;
    }
    const list = document.createElement("div");
    list.className = "opt-list";
    vault.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "opt-list-row";
      const meta = [entry.relationship, entry.age ? `${entry.age} ${t("unit_years")}` : "", entry.gender, entry.idProof].filter(Boolean).join(" • ");
      const rowInfo = document.createElement("div");
      rowInfo.className = "opt-list-row-info";
      const nameEl = document.createElement("strong");
      nameEl.textContent = entry.name || t("vault_unnamed");
      const vaultBadge = buildBadge(validatePilgrim(entry, { requireIdNumber: !!entry.idNumber }));
      if (vaultBadge) {
        nameEl.appendChild(document.createTextNode(" "));
        nameEl.appendChild(vaultBadge);
      }
      const metaEl = document.createElement("span");
      metaEl.textContent = meta;
      rowInfo.appendChild(nameEl);
      rowInfo.appendChild(metaEl);
      row.appendChild(rowInfo);
      const actions = document.createElement("div");
      actions.className = "opt-list-row-actions";
      const editBtn = document.createElement("button");
      editBtn.className = "btn-secondary btn-sm";
      editBtn.textContent = "✏️";
      editBtn.addEventListener("click", () => {
        form = { ...emptyVaultEntry(), ...entry };
        editingId = entry.id;
        renderForm();
        formCard.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      const delBtn = document.createElement("button");
      delBtn.className = "btn-delete";
      delBtn.textContent = "🗑️";
      delBtn.addEventListener("click", async () => {
        if (!confirm(t("opt_vault_delete_confirm"))) return;
        vault = vault.filter((v) => v.id !== entry.id);
        await storageSet({ [STORAGE_KEYS.vault]: vault });
        const sets = (await storageGet([STORAGE_KEYS.sets]))[STORAGE_KEYS.sets] || [];
        const updatedSets = sets.map((s) => ({ ...s, pilgrimIds: (s.pilgrimIds || []).filter((id) => id !== entry.id) }));
        await storageSet({ [STORAGE_KEYS.sets]: updatedSets });
        showToast(t("opt_vault_deleted"));
        renderList();
      });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      row.appendChild(actions);
      list.appendChild(row);
    });
    listCard.appendChild(list);
  }

  function renderForm() {
    formCard.innerHTML = `<h2>${t(editingId ? "opt_vault_edit" : "opt_vault_add")}</h2>`;
    // A saved pilgrim may legitimately have no ID stored yet, so the number is
    // only checked for format once they've started typing one.
    const { el: formEl } = buildPilgrimForm({
      value: form,
      editing: !!editingId,
      requireIdNumber: false,
      contactOpen: CONTACT_FIELDS.some((f) => form[f]),
      onInvalid: () => showToast(t("validation_blocked_toast"), "error"),
      onCancel: editingId
        ? () => {
            form = emptyVaultEntry();
            editingId = null;
            renderForm();
          }
        : null,
      onSubmit: async (data) => {
        const now = new Date().toISOString();
        if (editingId) {
          vault = vault.map((v) => (v.id === editingId ? { ...v, ...data, updatedAt: now } : v));
        } else {
          vault = [...vault, { ...data, id: uid(), createdAt: now, updatedAt: now }];
        }
        await storageSet({ [STORAGE_KEYS.vault]: vault });
        showToast(t("opt_vault_saved"));
        form = emptyVaultEntry();
        editingId = null;
        renderForm();
        renderList();
      },
    });
    formCard.appendChild(formEl);
  }

  renderList();
  renderForm();
}

// ----------------------------------------------------------------- Sets ----
async function renderSetsScreen(main) {
  let vault = (await storageGet([STORAGE_KEYS.vault]))[STORAGE_KEYS.vault] || [];
  let sets = (await storageGet([STORAGE_KEYS.sets]))[STORAGE_KEYS.sets] || [];

  const screen = document.createElement("div");
  screen.className = "opt-screen";
  screen.innerHTML = `<h1>${t("opt_nav_sets").replace(/^\S+\s/, "")}</h1><p class="opt-subtitle">${t("opt_sets_subtitle")}</p>`;
  main.appendChild(screen);

  const createCard = document.createElement("div");
  createCard.className = "opt-card";
  createCard.innerHTML = `<h2>${t("opt_sets_create")}</h2>`;
  const createForm = document.createElement("form");
  createForm.className = "form-row";
  createForm.innerHTML = `
    <div class="form-group" style="flex:1;"><input name="name" placeholder="${t("opt_sets_name_placeholder")}" required /></div>
    <div class="form-group" style="flex:0;"><button type="submit" class="btn-primary">${t("opt_sets_create")}</button></div>
  `;
  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = createForm.elements.name.value.trim() || "Untitled set";
    const now = new Date().toISOString();
    sets = [...sets, { id: uid(), name, pilgrimIds: [], createdAt: now, updatedAt: now }];
    await storageSet({ [STORAGE_KEYS.sets]: sets });
    showToast(t("opt_sets_created"));
    createForm.reset();
    renderList();
  });
  createCard.appendChild(createForm);
  screen.appendChild(createCard);

  const listWrap = document.createElement("div");
  screen.appendChild(listWrap);

  function renderList() {
    listWrap.innerHTML = "";
    if (vault.length === 0) {
      const empty = document.createElement("div");
      empty.className = "opt-empty";
      empty.textContent = t("opt_sets_add_pilgrims_first");
      listWrap.appendChild(empty);
      return;
    }
    if (sets.length === 0) {
      const empty = document.createElement("div");
      empty.className = "opt-empty";
      empty.textContent = t("opt_sets_empty");
      listWrap.appendChild(empty);
      return;
    }
    sets.forEach((set) => {
      const card = document.createElement("div");
      card.className = "opt-card";
      const header = document.createElement("div");
      header.className = "opt-card-row";
      header.style.borderBottom = "none";
      const nameInput = document.createElement("input");
      nameInput.value = set.name;
      nameInput.style.cssText = "font-weight:700;font-size:14px;border:none;background:transparent;flex:1;padding:4px 0;";
      nameInput.addEventListener("change", async () => {
        set.name = nameInput.value.trim() || "Untitled set";
        set.updatedAt = new Date().toISOString();
        await storageSet({ [STORAGE_KEYS.sets]: sets });
        showToast(t("opt_sets_updated"));
      });
      const delBtn = document.createElement("button");
      delBtn.className = "btn-delete";
      delBtn.textContent = "🗑️";
      delBtn.addEventListener("click", async () => {
        if (!confirm(t("opt_sets_delete_confirm"))) return;
        sets = sets.filter((s) => s.id !== set.id);
        await storageSet({ [STORAGE_KEYS.sets]: sets });
        showToast(t("opt_sets_deleted"));
        renderList();
      });
      header.appendChild(nameInput);
      header.appendChild(delBtn);
      card.appendChild(header);

      const membersLabel = document.createElement("div");
      membersLabel.style.cssText = "font-size:11.5px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-top:6px;";
      membersLabel.textContent = t("opt_sets_members");
      card.appendChild(membersLabel);

      const chips = document.createElement("div");
      chips.className = "opt-member-chips";
      vault.forEach((entry) => {
        const chip = document.createElement("button");
        chip.type = "button";
        const selected = (set.pilgrimIds || []).includes(entry.id);
        chip.className = "opt-chip" + (selected ? " selected" : "");
        chip.textContent = (selected ? "✓ " : "") + (entry.name || t("vault_unnamed"));
        chip.addEventListener("click", async () => {
          const ids = new Set(set.pilgrimIds || []);
          if (ids.has(entry.id)) ids.delete(entry.id);
          else ids.add(entry.id);
          set.pilgrimIds = Array.from(ids);
          set.updatedAt = new Date().toISOString();
          await storageSet({ [STORAGE_KEYS.sets]: sets });
          renderList();
        });
        chips.appendChild(chip);
      });
      card.appendChild(chips);
      listWrap.appendChild(card);
    });
  }

  renderList();
}

// ----------------------------------------------------------- Tabs/Prefs ----
async function renderTabsScreen(main) {
  const screen = document.createElement("div");
  screen.className = "opt-screen";
  screen.innerHTML = `<h1>${t("opt_nav_tabs").replace(/^\S+\s/, "")}</h1><p class="opt-subtitle">${t("opt_tabs_subtitle")}</p>`;
  main.appendChild(screen);

  // Appearance
  const themeCard = document.createElement("div");
  themeCard.className = "opt-card";
  themeCard.innerHTML = `<h2>${t("opt_theme_title")}</h2><p class="opt-subtitle" style="margin-bottom:10px;">${t("opt_theme_subtitle")}</p>`;
  const themeRow = document.createElement("div");
  themeRow.className = "opt-theme-row";
  const currentTheme = (await storageGet([STORAGE_KEYS.theme]))[STORAGE_KEYS.theme] || "system";
  [["light", t("opt_theme_light")], ["dark", t("opt_theme_dark")], ["system", "🖥️ System"]].forEach(([value, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "opt-choice-btn" + (currentTheme === value ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", async () => {
      await storageSet({ [STORAGE_KEYS.theme]: value === "system" ? "" : value });
      await applyTheme();
      themeRow.querySelectorAll(".opt-choice-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
    themeRow.appendChild(btn);
  });
  themeCard.appendChild(themeRow);
  screen.appendChild(themeCard);

  // Language
  const langCard = document.createElement("div");
  langCard.className = "opt-card";
  langCard.innerHTML = `<h2>${t("opt_lang_title")}</h2><p class="opt-subtitle" style="margin-bottom:10px;">${t("opt_lang_subtitle")}</p>`;
  const langRow = document.createElement("div");
  langRow.className = "opt-lang-row";
  SUPPORTED_LOCALES.forEach((loc) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "opt-choice-btn" + (getLocale() === loc ? " active" : "");
    btn.textContent = LOCALE_LABELS[loc];
    btn.addEventListener("click", async () => {
      await setLocale(loc);
      await renderApp();
    });
    langRow.appendChild(btn);
  });
  langCard.appendChild(langRow);
  screen.appendChild(langCard);

  // Tab order/visibility
  const tabsCard = document.createElement("div");
  tabsCard.className = "opt-card";
  const heading = document.createElement("div");
  heading.className = "opt-card-row";
  heading.style.borderBottom = "none";
  heading.innerHTML = `<h2 style="margin:0;">${t("opt_nav_tabs").replace(/^\S+\s/, "")}</h2>`;
  const resetBtn = document.createElement("button");
  resetBtn.className = "btn-secondary btn-sm";
  resetBtn.textContent = t("opt_tabs_reset");
  tabsCard.appendChild(heading);
  heading.appendChild(resetBtn);

  const stored = await storageGet([STORAGE_KEYS.tabOrder, STORAGE_KEYS.hiddenTabs]);
  let order = Array.isArray(stored[STORAGE_KEYS.tabOrder]) ? stored[STORAGE_KEYS.tabOrder].filter((id) => DEFAULT_TAB_ORDER.includes(id)) : [...DEFAULT_TAB_ORDER];
  for (const id of DEFAULT_TAB_ORDER) if (!order.includes(id)) order.push(id);
  let hidden = new Set(Array.isArray(stored[STORAGE_KEYS.hiddenTabs]) ? stored[STORAGE_KEYS.hiddenTabs] : []);

  const persistTabs = () => storageSet({ [STORAGE_KEYS.tabOrder]: order, [STORAGE_KEYS.hiddenTabs]: Array.from(hidden) });

  function renderTabList() {
    tabsCard.querySelectorAll(".opt-tab-row").forEach((el) => el.remove());
    order.forEach((id, idx) => {
      const def = TAB_DEFS.find((d) => d.id === id);
      const row = document.createElement("div");
      row.className = "opt-tab-row" + (hidden.has(id) ? " hidden-tab" : "");
      row.innerHTML = `<span class="opt-tab-icon">${def.icon}</span><span class="opt-tab-name">${t(def.labelKey).replace(/^\S+\s/, "")}</span>`;

      const upBtn = document.createElement("button");
      upBtn.className = "reorder-btn";
      upBtn.textContent = "▲";
      upBtn.disabled = idx === 0;
      upBtn.addEventListener("click", async () => {
        [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
        await persistTabs();
        renderTabList();
      });
      const downBtn = document.createElement("button");
      downBtn.className = "reorder-btn";
      downBtn.textContent = "▼";
      downBtn.disabled = idx === order.length - 1;
      downBtn.addEventListener("click", async () => {
        [order[idx + 1], order[idx]] = [order[idx], order[idx + 1]];
        await persistTabs();
        renderTabList();
      });

      const toggleBtn = document.createElement("button");
      toggleBtn.className = "btn-secondary btn-sm";
      toggleBtn.textContent = hidden.has(id) ? t("opt_tabs_show") : t("opt_tabs_hide");
      toggleBtn.addEventListener("click", async () => {
        if (hidden.has(id)) hidden.delete(id);
        else {
          if (hidden.size >= order.length - 1) {
            showToast(t("opt_tabs_min_visible"), "warn");
            return;
          }
          hidden.add(id);
        }
        await persistTabs();
        renderTabList();
      });

      row.appendChild(upBtn);
      row.appendChild(downBtn);
      row.appendChild(toggleBtn);
      tabsCard.appendChild(row);
    });
  }
  resetBtn.addEventListener("click", async () => {
    order = [...DEFAULT_TAB_ORDER];
    hidden = new Set();
    await persistTabs();
    showToast(t("tabmanager_reset"));
    renderTabList();
  });
  renderTabList();
  screen.appendChild(tabsCard);
}

// ---------------------------------------------------------------- Backup ----
const BACKUP_KEYS = [
  STORAGE_KEYS.pilgrims, STORAGE_KEYS.contact, STORAGE_KEYS.vault, STORAGE_KEYS.sets,
  STORAGE_KEYS.sevakData, STORAGE_KEYS.groupSevaData, STORAGE_KEYS.groupVisibleCount,
  STORAGE_KEYS.srivaniPeople, STORAGE_KEYS.tabOrder, STORAGE_KEYS.hiddenTabs,
  STORAGE_KEYS.theme, STORAGE_KEYS.locale,
];

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function renderBackupScreen(main) {
  const screen = document.createElement("div");
  screen.className = "opt-screen";
  screen.innerHTML = `<h1>${t("opt_nav_backup").replace(/^\S+\s/, "")}</h1><p class="opt-subtitle">${t("opt_backup_subtitle")}</p>`;
  main.appendChild(screen);
  screen.appendChild(buildPrivacyCallout());

  // ---- Export ----
  const exportCard = document.createElement("div");
  exportCard.className = "opt-card";
  exportCard.innerHTML = `<h2>${t("opt_backup_export")}</h2><p class="opt-subtitle" style="margin-bottom:12px;">${t("opt_backup_export_hint")}</p>`;

  const encryptToggle = document.createElement("label");
  encryptToggle.className = "checkbox-label";
  encryptToggle.style.marginBottom = "6px";
  const encryptCheck = document.createElement("input");
  encryptCheck.type = "checkbox";
  encryptCheck.checked = true;
  encryptToggle.appendChild(encryptCheck);
  encryptToggle.appendChild(document.createTextNode(t("opt_backup_encrypt_label")));
  exportCard.appendChild(encryptToggle);

  const encryptHint = document.createElement("p");
  encryptHint.className = "opt-subtitle";
  encryptHint.style.margin = "0 0 12px 24px";
  exportCard.appendChild(encryptHint);

  const passRow = document.createElement("div");
  passRow.className = "form-row";
  passRow.innerHTML = `
    <div class="form-group"><label>${t("opt_backup_passphrase")}</label><input type="password" name="pass" autocomplete="new-password" /></div>
    <div class="form-group"><label>${t("opt_backup_passphrase_confirm")}</label><input type="password" name="pass2" autocomplete="new-password" /></div>
  `;
  exportCard.appendChild(passRow);

  const strengthNote = document.createElement("div");
  strengthNote.className = "field-hint";
  strengthNote.style.marginBottom = "12px";
  exportCard.appendChild(strengthNote);

  const passInput = passRow.querySelector('input[name="pass"]');
  const pass2Input = passRow.querySelector('input[name="pass2"]');
  passInput.addEventListener("input", () => {
    const strength = passphraseStrength(passInput.value);
    strengthNote.textContent = strength.label;
    strengthNote.style.color =
      strength.level === "strong" ? "var(--success)" : strength.level === "fair" ? "var(--warn)" : "var(--danger)";
  });

  const syncPassVisibility = () => {
    passRow.hidden = !encryptCheck.checked;
    strengthNote.hidden = !encryptCheck.checked;
    encryptHint.textContent = encryptCheck.checked ? t("opt_backup_encrypt_hint") : t("opt_backup_plain_note");
    encryptHint.style.color = encryptCheck.checked ? "" : "var(--danger)";
    encryptHint.style.fontWeight = encryptCheck.checked ? "" : "600";
  };
  encryptCheck.addEventListener("change", syncPassVisibility);
  syncPassVisibility();

  const exportBtn = document.createElement("button");
  exportBtn.className = "btn-primary";
  exportBtn.textContent = t("opt_backup_export");
  exportBtn.addEventListener("click", async () => {
    if (encryptCheck.checked) {
      if (passInput.value.length < 8) {
        showToast(t("opt_security_too_short"), "error");
        return;
      }
      if (passInput.value !== pass2Input.value) {
        showToast(t("opt_security_mismatch"), "error");
        return;
      }
    }
    let data;
    try {
      data = await storageGet(BACKUP_KEYS);
    } catch {
      showToast(t("lock_title"), "error");
      return;
    }
    const payload = { app: "ttd-form-helper", schemaVersion: 1, exportedAt: new Date().toISOString(), data };
    const date = new Date().toISOString().slice(0, 10);

    if (encryptCheck.checked) {
      const file = await encryptBackup(payload, passInput.value);
      downloadJson(`ttd-form-helper-backup-${date}.enc.json`, file);
      passInput.value = "";
      pass2Input.value = "";
      strengthNote.textContent = "";
    } else {
      downloadJson(`ttd-form-helper-backup-${date}.json`, payload);
    }
    showToast(t("opt_backup_exported"));
  });
  exportCard.appendChild(exportBtn);
  screen.appendChild(exportCard);

  // ---- Import ----
  const importCard = document.createElement("div");
  importCard.className = "opt-card";
  importCard.innerHTML = `<h2>${t("opt_backup_import")}</h2><p class="opt-subtitle" style="margin-bottom:10px;">${t("opt_backup_import_hint")}</p>`;

  const modeRow = document.createElement("div");
  modeRow.className = "radio-group";
  modeRow.style.marginBottom = "12px";
  modeRow.innerHTML = `
    <label class="radio-label"><input type="radio" name="import-mode" value="merge" checked />${t("opt_backup_mode_merge")}</label>
    <label class="radio-label"><input type="radio" name="import-mode" value="replace" />${t("opt_backup_mode_replace")}</label>
  `;
  importCard.appendChild(modeRow);

  const chooseBtn = document.createElement("button");
  chooseBtn.className = "btn-secondary";
  chooseBtn.textContent = t("opt_backup_import");
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json,.json";
  fileInput.className = "opt-file-input";
  chooseBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      let parsed = JSON.parse(text);

      if (isEncryptedBackup(parsed)) {
        const passphrase = prompt(t("opt_backup_import_passphrase"));
        if (passphrase === null) {
          fileInput.value = "";
          return;
        }
        try {
          parsed = await decryptBackup(parsed, passphrase);
        } catch {
          showToast(t("opt_backup_wrong_passphrase"), "error");
          fileInput.value = "";
          return;
        }
      }

      if (!parsed || parsed.app !== "ttd-form-helper" || typeof parsed.data !== "object") {
        showToast(t("opt_backup_invalid"), "error");
        fileInput.value = "";
        return;
      }

      const mode = importCard.querySelector('input[name="import-mode"]:checked').value;
      if (mode === "replace" && !confirm(t("opt_backup_confirm_replace"))) {
        fileInput.value = "";
        return;
      }

      if (mode === "replace") {
        await storageSet(parsed.data);
      } else {
        const arrayKeys = [STORAGE_KEYS.vault, STORAGE_KEYS.sets];
        const merged = {};
        const existing = await storageGet(arrayKeys);
        for (const key of arrayKeys) {
          const incoming = Array.isArray(parsed.data[key]) ? parsed.data[key] : [];
          const current = Array.isArray(existing[key]) ? existing[key] : [];
          const byId = new Map(current.map((item) => [item.id, item]));
          for (const item of incoming) byId.set(item.id, item);
          merged[key] = Array.from(byId.values());
        }
        await storageSet(merged);
      }
      showToast(t("opt_backup_imported"));
      fileInput.value = "";
      await switchScreen("backup");
    } catch {
      showToast(t("opt_backup_invalid"), "error");
      fileInput.value = "";
    }
  });
  importCard.appendChild(chooseBtn);
  importCard.appendChild(fileInput);
  screen.appendChild(importCard);
}

// -------------------------------------------------------------- Security ----
async function renderSecurityScreen(main) {
  const screen = document.createElement("div");
  screen.className = "opt-screen";
  screen.innerHTML = `<h1>${t("opt_security_title")}</h1><p class="opt-subtitle">${t("opt_security_subtitle")}</p>`;
  main.appendChild(screen);

  const state = await getVaultState();

  const statusCard = document.createElement("div");
  statusCard.className = "opt-card";
  const on = state.enabled;
  statusCard.innerHTML =
    `<h2>${on ? "🔐 " + t("opt_security_status_on") : "🔓 " + t("opt_security_status_off")}</h2>` +
    `<p class="opt-subtitle" style="margin-bottom:14px;">${on ? t("opt_security_status_on_body") : t("opt_security_status_off_body")}</p>`;
  screen.appendChild(statusCard);

  if (!state.supported) {
    const warn = document.createElement("div");
    warn.className = "opt-empty";
    warn.textContent = t("opt_security_unsupported");
    statusCard.appendChild(warn);
    return;
  }

  if (!on) {
    const form = document.createElement("form");
    form.innerHTML = `
      <div class="form-row">
        <div class="form-group"><label>${t("opt_security_passphrase")}</label><input type="password" name="pass" autocomplete="new-password" required /></div>
        <div class="form-group"><label>${t("opt_security_passphrase_confirm")}</label><input type="password" name="pass2" autocomplete="new-password" required /></div>
      </div>
    `;
    const strengthNote = document.createElement("div");
    strengthNote.className = "field-hint";
    strengthNote.style.marginBottom = "10px";
    form.appendChild(strengthNote);

    const warning = document.createElement("div");
    warning.className = "issue-list warning-tone";
    warning.style.marginBottom = "14px";
    warning.textContent = "⚠ " + t("opt_security_warning");
    form.appendChild(warning);

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "btn-primary";
    submit.textContent = t("opt_security_enable");
    form.appendChild(submit);

    const passInput = form.elements.pass;
    passInput.addEventListener("input", () => {
      const strength = passphraseStrength(passInput.value);
      strengthNote.textContent = strength.label;
      strengthNote.style.color =
        strength.level === "strong" ? "var(--success)" : strength.level === "fair" ? "var(--warn)" : "var(--danger)";
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pass = form.elements.pass.value;
      const pass2 = form.elements.pass2.value;
      if (pass.length < 8) return showToast(t("opt_security_too_short"), "error");
      if (pass !== pass2) return showToast(t("opt_security_mismatch"), "error");
      submit.disabled = true;
      try {
        await enableEncryption(pass);
        showToast(t("opt_security_enabled_toast"), "success");
        await switchScreen("security");
      } catch (err) {
        showToast(String((err && err.message) || err), "error");
        submit.disabled = false;
      }
    });
    statusCard.appendChild(form);
  } else {
    const changeCard = document.createElement("div");
    changeCard.className = "opt-card";
    changeCard.innerHTML = `<h2>${t("opt_security_change")}</h2>`;
    const changeForm = document.createElement("form");
    changeForm.innerHTML = `
      <div class="form-group"><label>${t("opt_security_passphrase_current")}</label><input type="password" name="current" autocomplete="current-password" required /></div>
      <div class="form-row">
        <div class="form-group"><label>${t("opt_security_passphrase_new")}</label><input type="password" name="next" autocomplete="new-password" required /></div>
        <div class="form-group"><label>${t("opt_security_passphrase_confirm")}</label><input type="password" name="next2" autocomplete="new-password" required /></div>
      </div>
      <button type="submit" class="btn-primary">${t("opt_security_change")}</button>
    `;
    changeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const cur = changeForm.elements.current.value;
      const next = changeForm.elements.next.value;
      const next2 = changeForm.elements.next2.value;
      if (next.length < 8) return showToast(t("opt_security_too_short"), "error");
      if (next !== next2) return showToast(t("opt_security_mismatch"), "error");
      const ok = await changePassphrase(cur, next);
      if (!ok) return showToast(t("opt_security_wrong_current"), "error");
      showToast(t("opt_security_changed_toast"), "success");
      changeForm.reset();
    });
    changeCard.appendChild(changeForm);
    screen.appendChild(changeCard);

    const disableBtn = document.createElement("button");
    disableBtn.className = "btn-secondary";
    disableBtn.textContent = t("opt_security_disable");
    disableBtn.addEventListener("click", async () => {
      if (!confirm(t("opt_security_disable_confirm"))) return;
      try {
        await disableEncryption();
        showToast(t("opt_security_disabled_toast"));
        await switchScreen("security");
      } catch {
        showToast(t("lock_title"), "error");
      }
    });
    statusCard.appendChild(disableBtn);
  }

  const howCard = document.createElement("div");
  howCard.className = "opt-card";
  howCard.innerHTML = `<h2>${t("opt_security_how_title")}</h2><p class="opt-subtitle" style="margin:0;">${t("opt_security_how_body")}</p>`;
  screen.appendChild(howCard);
}

// ----------------------------------------------------------------- About ----
async function renderAboutScreen(main) {
  const screen = document.createElement("div");
  screen.className = "opt-screen";
  screen.innerHTML = `<h1>${t("opt_nav_about").replace(/^\S+\s/, "")}</h1>`;

  const infoCard = document.createElement("div");
  infoCard.className = "opt-card";
  infoCard.innerHTML = `<p>${t("opt_about_body")}</p>
    <h2 style="margin-top:16px;">${t("opt_about_permissions_title")}</h2>
    <ul style="margin:0;padding-left:18px;font-size:13px;color:var(--text-secondary);">
      <li>${t("opt_about_permission_storage")}</li>
      <li>${t("opt_about_permission_activetab")}</li>
    </ul>`;
  screen.insertBefore(buildPrivacyCallout(), screen.firstChild.nextSibling);
  screen.appendChild(infoCard);
  screen.appendChild(buildSafetyCard());

  const dangerCard = document.createElement("div");
  dangerCard.className = "opt-card opt-danger-card";
  dangerCard.innerHTML = `<h2>${t("opt_about_danger_title")}</h2><p class="opt-subtitle" style="margin-bottom:10px;">${t("opt_about_danger_body")}</p>`;
  const input = document.createElement("input");
  input.placeholder = t("opt_about_danger_confirm_type");
  input.style.cssText = "max-width:220px;margin-bottom:10px;display:block;padding:8px 10px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface);color:var(--text);";
  const btn = document.createElement("button");
  btn.className = "btn-delete";
  btn.style.padding = "9px 16px";
  btn.textContent = t("opt_about_danger_button");
  btn.addEventListener("click", async () => {
    if (input.value.trim() !== "DELETE") {
      showToast(t("opt_about_danger_confirm_type"), "warn");
      return;
    }
    await storageClear();
    showToast(t("opt_about_danger_done"));
    input.value = "";
    await switchScreen("vault");
  });
  dangerCard.appendChild(input);
  dangerCard.appendChild(btn);
  screen.appendChild(dangerCard);

  main.appendChild(screen);
}

async function renderApp() {
  const state = await getVaultState();
  const sidebar = document.querySelector(".opt-sidebar");
  const mainEl = document.getElementById("opt-main");

  // While locked we hide the nav entirely — every screen needs the data.
  if (state.enabled && !state.unlocked) {
    if (sidebar) sidebar.classList.add("locked");
    document.getElementById("opt-nav").innerHTML = "";
    renderUnlockScreen(mainEl, { onUnlocked: renderApp });
    return;
  }

  if (sidebar) sidebar.classList.remove("locked");
  renderNav();
  await switchScreen(activeScreen);
}

// Saved pilgrims and sets are edited from the panel too, so repaint when the
// underlying records change rather than showing a stale list until reload.
function watchSharedRecords() {
  const WATCHED = [STORAGE_KEYS.vault, STORAGE_KEYS.sets, STORAGE_KEYS.pilgrims];
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !WATCHED.some((k) => k in changes)) return;
    if (activeScreen !== "vault" && activeScreen !== "sets") return;
    // Don't yank a half-typed form out from under the user.
    const editing = document.querySelector("#opt-main .invalid, #opt-main [data-cancel]");
    if (editing) return;
    switchScreen(activeScreen);
  });
}

async function main() {
  await initI18n();
  await applyTheme();
  await renderApp();
  watchSharedRecords();
}

main();
