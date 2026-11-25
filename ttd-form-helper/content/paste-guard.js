// TTD Form Helper — keep copy and paste working in TTD's form fields.
//
// Runs at document_start, before any of the site's own scripts, so its
// capture listeners on window are the first to see each event. TTD's pages
// stop paste in more ways than cancelling the paste event (which autofill.js
// already handles): they swallow Ctrl+V / Shift+Insert on keydown so no paste
// event ever fires, disable the right-click menu (so there is no "Paste"),
// block copy / cut / select-all, and set user-select: none on inputs. Each of
// those only works if the page's handler runs; this stops the event from
// reaching the page (stopImmediatePropagation, never preventDefault), so the
// browser does its normal thing and the paste event then reaches
// autofill.js's cleaner, which tidies the text and types it as trusted input.
//
// Only the user's own text fields are touched: not our UI, not read-only or
// disabled fields, not one-character OTP boxes (the site handles pasting a
// whole OTP itself). Settings → "Help pasting into TTD's fields" turns it off.
(() => {
  "use strict";
  if (globalThis.__ttdfhPasteGuard) return;
  globalThis.__ttdfhPasteGuard = true;

  let enabled = true;
  try {
    chrome.storage.local.get(["allowPaste"], (items) => {
      enabled = !items || items.allowPaste !== false;
      setStyle();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !("allowPaste" in changes)) return;
      enabled = changes.allowPaste.newValue !== false;
      setStyle();
    });
  } catch {}

  const TEXT_TYPES = /^(text|search|tel|email|number|url|)$/i;
  const isPasteField = (el) => {
    if (!el || el.nodeType !== 1) return false;
    const isInput = el instanceof HTMLInputElement;
    if (!isInput && !(el instanceof HTMLTextAreaElement)) return false;
    if (isInput && !TEXT_TYPES.test(el.getAttribute("type") || "")) return false;
    if (el.readOnly || el.disabled || el.maxLength === 1) return false;
    if (el.closest('[id^="ttdfh-"]')) return false;
    return true;
  };
  const target = (e) => {
    const t = e.composedPath ? e.composedPath()[0] : e.target;
    return t && t.nodeType === 1 ? t : document.activeElement;
  };
  const shield = (e) => e.stopImmediatePropagation();

  // Ctrl/Cmd + V, C, X, A and Shift+Insert / Ctrl+Insert in a text field.
  const isClipboardKey = (e) => {
    const k = (e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && ["v", "c", "x", "a", "z", "y"].includes(k)) return true;
    if (k === "insert" && (e.shiftKey || e.ctrlKey)) return true;
    return false;
  };
  for (const type of ["keydown", "keypress", "keyup"]) {
    window.addEventListener(
      type,
      (e) => {
        if (enabled && isClipboardKey(e) && isPasteField(target(e))) shield(e);
      },
      true
    );
  }

  // Paste: let autofill.js (same isolated world) clean and insert it, then
  // keep the event from the page so its own onpaste can't undo the insert.
  // If autofill.js has not loaded yet the browser just pastes as normal.
  window.addEventListener(
    "paste",
    (e) => {
      if (!enabled || !isPasteField(target(e))) return;
      const handler = globalThis.__ttdfhOnPaste;
      if (typeof handler === "function") {
        try {
          handler(e);
        } catch {}
      }
      shield(e);
    },
    true
  );

  // Copy, cut, the right-click menu, selecting text and drag-and-drop text.
  for (const type of ["copy", "cut", "contextmenu", "selectstart", "dragstart", "drop"]) {
    window.addEventListener(
      type,
      (e) => {
        if (enabled && isPasteField(target(e))) shield(e);
      },
      true
    );
  }

  // Some pages make inputs unselectable with CSS.
  const STYLE_ID = "ttdfh-paste-style";
  function setStyle() {
    const root = document.head || document.documentElement;
    let node = document.getElementById(STYLE_ID);
    if (!enabled) {
      if (node) node.remove();
      return;
    }
    if (node || !root) return;
    node = document.createElement("style");
    node.id = STYLE_ID;
    node.textContent =
      "input:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled]) { -webkit-user-select: text !important; user-select: text !important; }";
    root.appendChild(node);
  }
  if (document.documentElement) setStyle();
  else document.addEventListener("DOMContentLoaded", setStyle, { once: true });
})();
