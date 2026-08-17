// Talks to the content script injected on the two supported TTD sites.
import { api } from "./browser.js";
const SUPPORTED_HOSTS = ["tirupatibalaji.ap.gov.in", "ttdevasthanams.ap.gov.in"];

export function isSupportedUrl(url) {
  try {
    const u = new URL(url);
    return SUPPORTED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
  } catch {
    return false;
  }
}

export function getActiveTab() {
  return new Promise((resolve) => {
    api.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs && tabs[0]));
  });
}

export async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) throw new Error("NO_ACTIVE_TAB");
  if (!tab.url || !isSupportedUrl(tab.url)) throw new Error("UNSUPPORTED_PAGE");
  return new Promise((resolve, reject) => {
    try {
      api.tabs.sendMessage(tab.id, message, (response) => {
        if (api.runtime.lastError) {
          reject(new Error(api.runtime.lastError.message || "NO_RESPONSE"));
          return;
        }
        resolve(response);
      });
    } catch (err) {
      reject(err);
    }
  });
}

// Maps a {status:"error", message} response from the content script to a
// user-facing, translated string. Returns null for a success response.
export function describeFillResult(response, t) {
  if (!response || response.status !== "error") return null;
  const msg = response.message || "";
  if (/name inputs not found|booking form fields/i.test(msg)) return t("msg_booking_form_not_found");
  if (msg) return t("msg_autofill_failed_reason", { reason: msg });
  return t("msg_autofill_failed_unknown");
}

// Maps a thrown error (network/messaging failure) to a translated string.
export function describeThrownError(err, t) {
  const msg = (err && err.message) || String(err || "");
  if (msg === "UNSUPPORTED_PAGE" || msg === "NO_ACTIVE_TAB") return t("msg_open_supported_booking_page");
  if (/could not establish connection|receiving end does not exist/i.test(msg)) return t("msg_refresh_updated_ttd_page");
  if (/extension context invalidated/i.test(msg)) return t("msg_refresh_updated_ttd_page");
  return t("msg_autofill_failed_reason", { reason: msg });
}
