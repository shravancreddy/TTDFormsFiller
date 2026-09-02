import { storageGet, storageSet, STORAGE_KEYS } from "../shared/storage.js";
import { getVaultState, lockVault } from "../shared/secureStore.js";
import { renderUnlockScreen } from "../shared/unlockScreen.js";
import { api } from "../shared/browser.js";
import { initI18n, t } from "../shared/i18n.js";
import { renderPilgrimTab } from "./tabs/pilgrimTab.js";
import { renderSevaTab } from "./tabs/sevaTab.js";
import { renderGroupTab } from "./tabs/groupTab.js";
import { renderSrivaniTab } from "./tabs/srivaniTab.js";

const TAB_DEFS = [
  { id: "pilgrim", icon: "🛕", labelKey: "tab_pilgrim", render: renderPilgrimTab },
  { id: "seva", icon: "🙏", labelKey: "tab_seva", render: renderSevaTab },
  { id: "group", icon: "👥", labelKey: "tab_seva_group", render: renderGroupTab },
  { id: "srivani", icon: "🪔", labelKey: "tab_srivani", render: renderSrivaniTab },
];
const DEFAULT_ORDER = TAB_DEFS.map((d) => d.id);

async function applyTheme() {
  const stored = (await storageGet([STORAGE_KEYS.theme]))[STORAGE_KEYS.theme];
  if (stored === "light" || stored === "dark") {
    document.documentElement.setAttribute("data-theme", stored);
  }
  const toggle = document.getElementById("theme-toggle");
  const isDark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
  toggle.textContent = isDark ? "☀️" : "🌙";
}

function wireThemeToggle() {
  document.getElementById("theme-toggle").addEventListener("click", async () => {
    const stored = (await storageGet([STORAGE_KEYS.theme]))[STORAGE_KEYS.theme];
    const isDark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";
    await storageSet({ [STORAGE_KEYS.theme]: next });
    document.documentElement.setAttribute("data-theme", next);
    await applyTheme();
  });
}

function wireSettingsButton() {
  document.getElementById("open-settings").addEventListener("click", () => {
    api.runtime.openOptionsPage();
  });
}

// The panel stays open until it's dismissed on purpose — the toolbar icon
// toggles it, and this is the other way out.
function wireCloseButton() {
  document.getElementById("close-panel").addEventListener("click", () => {
    window.close();
  });
}

/** Shows a padlock button only when at-rest encryption is switched on. */
async function syncLockButton() {
  const btn = document.getElementById("lock-toggle");
  const state = await getVaultState();
  btn.hidden = !state.enabled;
  btn.title = t("lock_now");
  btn.setAttribute("aria-label", t("lock_now"));
}

function wireLockButton() {
  document.getElementById("lock-toggle").addEventListener("click", async () => {
    await lockVault();
    await boot();
  });
}

async function getTabOrder() {
  const stored = await storageGet([STORAGE_KEYS.tabOrder, STORAGE_KEYS.hiddenTabs]);
  let order = Array.isArray(stored[STORAGE_KEYS.tabOrder]) ? stored[STORAGE_KEYS.tabOrder].filter((id) => DEFAULT_ORDER.includes(id)) : DEFAULT_ORDER;
  for (const id of DEFAULT_ORDER) if (!order.includes(id)) order.push(id);
  const hidden = Array.isArray(stored[STORAGE_KEYS.hiddenTabs]) ? stored[STORAGE_KEYS.hiddenTabs] : [];
  let visible = order.filter((id) => !hidden.includes(id));
  if (visible.length === 0) visible = order; // safety net: never hide every tab
  return visible;
}

async function initTabs() {
  const nav = document.getElementById("tab-nav");
  const content = document.getElementById("tab-content");
  const visibleIds = await getTabOrder();
  const tabs = visibleIds.map((id) => TAB_DEFS.find((d) => d.id === id)).filter(Boolean);

  let activeId = tabs[0]?.id;

  function renderNav() {
    nav.innerHTML = "";
    tabs.forEach((tab) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tab-btn" + (tab.id === activeId ? " active" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", tab.id === activeId ? "true" : "false");
      btn.innerHTML = `<span class="tab-icon" aria-hidden="true">${tab.icon}</span><span>${t(tab.labelKey).replace(/^\S+\s/, "")}</span>`;
      btn.addEventListener("click", () => switchTo(tab.id));
      nav.appendChild(btn);
    });
  }

  async function switchTo(id) {
    activeId = id;
    renderNav();
    const tab = tabs.find((tb) => tb.id === id);
    if (tab) await tab.render(content);
  }

  renderNav();
  if (tabs[0]) await switchTo(tabs[0].id);
}

function setChromeVisible(visible) {
  document.getElementById("tab-nav").hidden = !visible;
  document.getElementById("privacy-banner").hidden = !visible;
}

/** Renders either the unlock screen or the normal tabbed UI. */
async function boot() {
  const state = await getVaultState();
  await syncLockButton();

  if (state.enabled && !state.unlocked) {
    setChromeVisible(false);
    renderUnlockScreen(document.getElementById("tab-content"), { onUnlocked: boot });
    return;
  }

  setChromeVisible(true);
  await initTabs();
}

function renderPrivacyBanner() {
  const banner = document.getElementById("privacy-banner");
  banner.innerHTML =
    `<span class="privacy-badge">${t("privacy_badge")}</span>` +
    `<span class="privacy-text">${t("privacy_banner_short")}</span>`;
}

async function main() {
  await initI18n();
  document.getElementById("brand-tag").textContent = t("popup_tagline");
  renderPrivacyBanner();
  await applyTheme();
  wireThemeToggle();
  wireSettingsButton();
  wireCloseButton();
  wireLockButton();
  await boot();
}

main();
