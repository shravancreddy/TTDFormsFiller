// Background worker. Its only job is to answer the on-page Fill button when
// at-rest encryption is switched on — content scripts can't reach
// storage.session, so they ask here for the decrypted pilgrim data.
//
// This is the one place in the extension that hands out decrypted personal
// data in response to a message, so the sender is checked before answering:
//   1. it must be this extension (a web page cannot reach us at all, because
//      no `externally_connectable` is declared — this is belt-and-braces), and
//   2. if it came from a tab, that tab must be one of the two TTD origins.
// Nothing is cached on disk and nothing ever leaves the browser.
import { api } from "./shared/browser.js";
import { secureGet, getVaultState } from "./shared/secureStore.js";

const ALLOWED_ORIGINS = ["https://tirupatibalaji.ap.gov.in", "https://ttdevasthanams.ap.gov.in"];
const ALLOWED_KEYS = ["pilgrims", "contact"];

// The UI runs in the side panel rather than a popup: a popup closes the moment
// you click anything outside it, which made copying details in from another
// page or tab impossible. The side panel stays open, is resized by dragging its
// edge, and toggles from the toolbar icon.
function enableSidePanel() {
  try {
    if (api.sidePanel && api.sidePanel.setPanelBehavior) {
      api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
    }
  } catch {}
}
enableSidePanel();
api.runtime.onInstalled?.addListener(enableSidePanel);
api.runtime.onStartup?.addListener(enableSidePanel);

// Fallback for builds without the side panel API (older Chrome, Safari): the
// toolbar click has no popup to open, so give it a real window instead.
// With openPanelOnActionClick set, Chrome opens the panel and this never fires.
api.action?.onClicked?.addListener(async (tab) => {
  try {
    if (api.sidePanel && api.sidePanel.open && tab && tab.windowId != null) {
      await api.sidePanel.open({ windowId: tab.windowId });
      return;
    }
  } catch {}
  try {
    await api.windows.create({
      url: api.runtime.getURL("popup/index.html"),
      type: "popup",
      width: 460,
      height: 780,
    });
  } catch {}
});

function isTrustedSender(sender) {
  if (!sender || sender.id !== api.runtime.id) return false;
  // Extension pages (popup/options) have no sender.tab and are trusted.
  if (!sender.tab) return true;
  const url = sender.url || sender.origin || "";
  return ALLOWED_ORIGINS.some((origin) => url === origin || url.startsWith(origin + "/"));
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "TFH_SECURE_GET") return;

  if (!isTrustedSender(sender)) {
    sendResponse({ ok: false, error: "UNTRUSTED_SENDER" });
    return true;
  }

  (async () => {
    try {
      const state = await getVaultState();
      if (state.enabled && !state.unlocked) {
        sendResponse({ ok: false, error: "VAULT_LOCKED" });
        return;
      }
      // Only ever hand back the two booking keys, whatever was asked for.
      const keys = (message.keys || []).filter((k) => ALLOWED_KEYS.includes(k));
      const data = await secureGet(keys);
      sendResponse({ ok: true, data });
    } catch (err) {
      sendResponse({ ok: false, error: (err && err.message) || "READ_FAILED" });
    }
  })();

  return true; // keep the channel open for the async reply
});
