// TTD Form Helper — content script.
// Fills the pilgrim / seva / srivani booking forms on the official TTD sites.
// Free for every user — no license, pass, or payment gate on any action.
(function () {
  // Chrome/Edge expose `chrome`; Firefox and Safari expose `browser`.
  const chrome = globalThis.chrome ?? globalThis.browser;

  const dispatchAll = (el) => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  };
  const norm = (s) => (s ? s.toString().toLowerCase().trim().replace(/\s+/g, " ") : "");

  // ---- On-page visual feedback (pure DOM, respects reduced-motion) ----
  const prefersReducedMotion = () => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  };
  const FEEDBACK_STYLE_ID = "ttdfh-feedback-style";
  const ensureFeedbackStyles = () => {
    if (document.getElementById(FEEDBACK_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = FEEDBACK_STYLE_ID;
    style.textContent = `
      @keyframes ttdfh-flash-ok { 0% { box-shadow: 0 0 0 3px rgba(30,158,92,.6); } 100% { box-shadow: 0 0 0 3px rgba(30,158,92,0); } }
      @keyframes ttdfh-flash-warn { 0% { box-shadow: 0 0 0 3px rgba(217,119,6,.65); } 100% { box-shadow: 0 0 0 3px rgba(217,119,6,0); } }
      .ttdfh-mark-ok { animation: ttdfh-flash-ok 1.1s ease-out; border-radius: 6px; }
      .ttdfh-mark-warn { animation: ttdfh-flash-warn 1.6s ease-out; border-radius: 6px; }
      .ttdfh-sr-only { position: fixed !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    `;
    (document.head || document.documentElement).appendChild(style);
  };
  const isOnScreen = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const flashField = (el, ok) => {
    if (!el || prefersReducedMotion() || !isOnScreen(el)) return;
    ensureFeedbackStyles();
    const cls = ok ? "ttdfh-mark-ok" : "ttdfh-mark-warn";
    el.classList.remove("ttdfh-mark-ok", "ttdfh-mark-warn");
    void el.offsetWidth; // reflow so the animation restarts on a repeated fill
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 1800);
  };
  let liveRegion = null;
  const announce = (msg) => {
    try {
      ensureFeedbackStyles();
      if (!liveRegion || !liveRegion.isConnected) {
        liveRegion = document.createElement("div");
        liveRegion.className = "ttdfh-sr-only";
        liveRegion.setAttribute("role", "status");
        liveRegion.setAttribute("aria-live", "polite");
        liveRegion.setAttribute("aria-atomic", "true");
        document.body.appendChild(liveRegion);
      }
      liveRegion.textContent = "";
      setTimeout(() => {
        if (liveRegion) liveRegion.textContent = msg;
      }, 30);
    } catch {}
  };
  // A single on-page toast helper shared by the fillers and the floating button.
  const PAGE_TOAST_ID = "ttdfh-fill-toast";
  const toast = (message, kind) => {
    try {
      const existing = document.getElementById(PAGE_TOAST_ID);
      if (existing) existing.remove();
      const color = kind === "error" ? "#DC2626" : kind === "warn" ? "#D97706" : "#1E9E5C";
      const node = document.createElement("div");
      node.id = PAGE_TOAST_ID;
      node.setAttribute("role", "status");
      node.textContent = message;
      node.style.cssText =
        "position:fixed;bottom:96px;right:22px;z-index:2147483647;background:" +
        color +
        ";color:#fff;font:600 13px/1.4 system-ui,-apple-system,sans-serif;padding:11px 16px;border-radius:12px;max-width:320px;box-shadow:0 10px 30px rgba(0,0,0,.3);";
      document.body.appendChild(node);
      announce(message);
      setTimeout(() => {
        if (document.getElementById(PAGE_TOAST_ID) === node) node.remove();
      }, 4500);
    } catch {}
  };

  // ---- Wait-for-condition helpers (replace brittle fixed sleeps) ----
  const waitFor = async (predicate, { timeout = 2500, interval = 60 } = {}) => {
    const start = Date.now();
    for (;;) {
      let result;
      try {
        result = predicate();
      } catch {
        result = false;
      }
      if (result) return result;
      if (Date.now() - start >= timeout) return null;
      await sleep(interval);
    }
  };
  const waitForElement = (selector, opts) => waitFor(() => document.querySelector(selector), opts);

  // ---- Unified controlled-input setter ----
  // Drives the React synthetic onChange a controlled input attaches, if present.
  const dispatchReactOnChange = (el, value, extra) => {
    const propsKey = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
    if (!propsKey) return false;
    const props = el[propsKey];
    if (!props || typeof props.onChange !== "function") return false;
    const base = { value, ...(extra || {}) };
    try {
      props.onChange({
        target: base,
        currentTarget: base,
        preventDefault: () => {},
        stopPropagation: () => {},
        persist: () => {},
        nativeEvent: new Event("change"),
      });
      return true;
    } catch {
      return false;
    }
  };
  // Writes a value to a plain (non-dropdown) input: native prototype setter +
  // input/change/blur, then the React onChange path if the framework ignored the
  // native write. Highlights the field green when the value stuck, amber if not.
  const setControlledValue = (el, value) => {
    if (!el) return false;
    const target = value == null ? "" : String(value);
    const desc = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value");
    if (desc && desc.set) desc.set.call(el, target);
    else el.value = target;
    dispatchAll(el);
    if ((el.value || "") !== target) dispatchReactOnChange(el, target);
    const ok = (el.value || "") === target || (!!el.value && target !== "");
    flashField(el, ok);
    return ok;
  };
  // Kept as the name the fillers already call throughout this file.
  const setNativeValue = (el, value) => setControlledValue(el, value);

  // Picks the right technique for a field: an autocomplete / read-only combobox
  // needs the floating-list flow; a plain text input takes a direct write.
  const looksLikeCombobox = (el) =>
    !!el &&
    (el.readOnly ||
      el.getAttribute("role") === "combobox" ||
      el.getAttribute("aria-autocomplete") === "list" ||
      el.getAttribute("aria-haspopup") === "listbox" ||
      el.hasAttribute("aria-expanded"));
  const smartSet = async (el, value) => {
    if (!el || value == null || value === "") return false;
    if (looksLikeCombobox(el)) {
      await selectFromDropdown(el, value);
      if (el.value && el.value.trim()) {
        flashField(el, true);
        return true;
      }
      // Dropdown route left it empty — fall through to a direct write.
    }
    return setControlledValue(el, value);
  };

  // Fills a React-controlled "combobox" style input: click it open, wait for the
  // floating option list to render, and click the option whose text matches.
  const selectFromDropdown = async (el, label) => {
    if (!el || !label) return false;
    if (el.value && el.value.trim().toLowerCase() === label.trim().toLowerCase()) return true;

    const setViaReactProps = (node, val) => {
      const propsKey = Object.keys(node).find(
        (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$") || k.startsWith("__reactProps$")
      );
      if (propsKey && propsKey.startsWith("__reactProps$")) {
        const props = node[propsKey];
        if (props && props.onChange) {
          const evt = {
            target: { value: val },
            currentTarget: { value: val },
            preventDefault: () => {},
            stopPropagation: () => {},
            persist: () => {},
            nativeEvent: new Event("change"),
          };
          try {
            props.onChange(evt);
            return true;
          } catch {}
        }
      }
      return false;
    };

    el.click();
    await sleep(20);
    el.focus();
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, view: window, pointerId: 1 }));
    await sleep(10);
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, view: window, pointerId: 1 }));
    await sleep(10);
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy }));
    await sleep(10);
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy }));
    await sleep(10);
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy }));

    for (let attempt = 0; attempt < 8; attempt++) {
      await sleep(40);
      const items = Array.from(
        document.querySelectorAll(
          '[class*="floatingDropdown_listItem"], [class*="dropdown_scroll"] li, .dropdown_scroll li, ul[style*="list-style-type: none"] li'
        )
      );
      if (items.length === 0) continue;

      const cleanText = (s) =>
        s
          .toLowerCase()
          .replace(/['‘’`]/g, "'")
          .replace(/["“”]/g, '"')
          .replace(/\s+/g, " ")
          .trim();
      const match = items.find((it) => {
        const txt = it.innerText?.trim();
        return txt && cleanText(txt) === cleanText(label);
      });
      if (!match) continue;

      const matchedText = match.innerText?.trim();
      match.focus?.();
      match.scrollIntoView?.({ block: "nearest" });
      match.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
      match.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      await sleep(10);
      match.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, view: window }));
      match.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      await sleep(20);
      match.click();
      match.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, detail: 1 }));
      match.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
      match.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
      await sleep(30);

      if (!el.value || el.value.trim() === "") {
        setViaReactProps(el, matchedText);
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        if (setter) {
          setter.call(el, matchedText);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        await sleep(20);
      }
      el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));

      // Nudge React state by clearing then restoring, in case onChange was missed.
      const setter2 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (setter2 && el.value) {
        const val = el.value;
        setter2.call(el, "");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        await sleep(20);
        setter2.call(el, val);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      await sleep(50);
      el.dispatchEvent(new FocusEvent("blur", { bubbles: true, relatedTarget: document.body }));
      document.body.click();
      await sleep(80);
      flashField(el, true);
      return true;
    }
    return false;
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const findByNameOrLabel = (name, labelText) => {
    let el = document.querySelector(`input[name="${name}"]`);
    if (el) return el;
    if (labelText) {
      const nodes = document.querySelectorAll("label, span, div");
      for (const node of nodes) {
        const text = node.textContent?.trim().toLowerCase();
        if (text && text.includes(labelText.toLowerCase())) {
          const wrap = node.closest("div");
          if (wrap && (el = wrap.querySelector("input"))) return el;
        }
      }
    }
    return null;
  };
  const findFirstByNames = (...names) => {
    for (const n of names) {
      const el = document.querySelector(`input[name="${n}"]`);
      if (el) return el;
    }
    return null;
  };
  const findAllByNames = (...names) => {
    for (const n of names) {
      const nodes = document.querySelectorAll(`input[name="${n}"]`);
      if (nodes.length > 0) return Array.from(nodes);
    }
    return [];
  };

  const fillContact = async (contact) => {
    if (!contact) return;
    if (contact.email) {
      const nodes = findAllByNames("pilgrimEmail", "emailId", "email");
      const el = nodes[nodes.length - 1];
      if (el) setNativeValue(el, contact.email);
    }
    if (contact.city) {
      const nodes = findAllByNames("pilgrimCity", "city");
      const el = nodes[nodes.length - 1];
      if (el) setNativeValue(el, contact.city);
    }
    if (contact.state) {
      const nodes = findAllByNames("pilgrimState", "state");
      const el = nodes[nodes.length - 1];
      if (el) setNativeValue(el, contact.state);
    }
    if (contact.country) {
      const nodes = findAllByNames("pilgrimCountry", "country");
      if (nodes.length > 0) {
        const el = nodes[nodes.length - 1];
        if (el) setNativeValue(el, contact.country);
      }
    }
    if (contact.pincode) {
      const el = findFirstByNames("pilgrimPincode", "pincode");
      if (el) setNativeValue(el, contact.pincode);
    }
    if (contact.gothram) {
      // The gothram field name varies across booking flows (the Homam / arjitha
      // seva form in particular), and on some pages it is a searchable
      // autocomplete rather than a plain input — so try several names/labels and
      // let smartSet choose the direct-write vs floating-list technique.
      const el =
        findFirstByNames("gothram", "gotram", "gotra", "gothra", "gothramName", "pilgrimGothram") ||
        findByNameOrLabel("gothram", "Gothram") ||
        findByNameOrLabel("gotra", "Gotra");
      if (el) {
        const ok = await smartSet(el, contact.gothram);
        if (!ok) flashField(el, false);
      }
    }
  };

  const nthByNames = (index, ...names) => {
    for (const n of names) {
      const nodes = document.querySelectorAll(`input[name="${n}"]`);
      if (nodes.length > index) return nodes[index];
    }
    return null;
  };

  const fillPilgrim = async (pilgrim, index, contactCountry) => {
    const byIndex = (name) => document.querySelectorAll(`input[name="${name}"]`)[index];

    const nameEl = nthByNames(index, "name", "fname");
    if (nameEl) setNativeValue(nameEl, pilgrim.name);
    await sleep(100);

    const ageEl = byIndex("age");
    if (ageEl) setNativeValue(ageEl, pilgrim.age);
    await sleep(100);

    const genderEl = byIndex("gender");
    if (genderEl) await selectFromDropdown(genderEl, pilgrim.gender);
    await sleep(80);

    const idTypeEl = nthByNames(index, "idType", "photoIdType");
    if (idTypeEl) {
      const idProof = (pilgrim.idProof || "Aadhaar Card").trim();
      await selectFromDropdown(idTypeEl, idProof);
      await sleep(300);
    }

    const idNumberEl = nthByNames(index, "idNumber", "idProofNumber");
    if (idNumberEl) {
      if (idNumberEl.disabled) idNumberEl.disabled = false;
      setNativeValue(idNumberEl, pilgrim.idNumber);
    }
    await sleep(80);

    if (norm(pilgrim.idProof) === "passport") {
      // Wait for the modal to be present *and* mounted (a field rendered),
      // rather than a fixed sleep that can fire before React fills it in.
      const popup = await waitFor(() => {
        const p =
          document.querySelector('[class*="passportVisaPopup"]') ||
          document.querySelector('[class*="popup"]') ||
          document.querySelector('[class*="modal"]');
        return p && p.querySelector("input") ? p : null;
      }, { timeout: 4000, interval: 150 });
      if (popup) {
        const field = (name) => popup.querySelector(`input[name="${name}"]`);
        const passportCountry = pilgrim.passportCountry || contactCountry;
        const wanted = [
          ["passportNumber", pilgrim.idNumber, "Passport number"],
          ["country", passportCountry, "Country"],
          ["visaNumber", pilgrim.visaNumber, "Visa number"],
          ["visaType", pilgrim.visaType, "Visa type"],
          ["visaValidityDate", pilgrim.visaValidityDate, "Visa validity"],
        ];
        for (const [name, value] of wanted) {
          if (!value) continue;
          const el = field(name);
          if (el) {
            await smartSet(el, value);
            await sleep(120);
          }
        }
        // Confirm each value actually took before trying to submit.
        const missing = wanted
          .filter(([name, value]) => value && (() => { const el = field(name); return !el || !el.value || !el.value.trim(); })())
          .map(([, , label]) => label);
        await sleep(300);
        const submitBtn =
          popup.querySelector('button[type="submit"]') ||
          popup.querySelector('button[class*="continueBtn"]') ||
          Array.from(popup.querySelectorAll("button")).find((b) => b.innerText?.toLowerCase().includes("submit"));
        if (submitBtn && !submitBtn.disabled && missing.length === 0) {
          submitBtn.click();
          await sleep(1000);
        } else if (missing.length > 0) {
          toast("Passport popup: still missing " + missing.join(", ") + ". Please review before submitting.", "warn");
        }
      }
    }
  };

  const setSelectByLabel = (selectEl, label) => {
    if (!selectEl || !label) return false;
    const target = norm(label);
    const options = Array.from(selectEl.options);
    const match =
      options.find((o) => norm(o.textContent) === target) ||
      options.find((o) => norm(o.textContent).includes(target));
    if (!match) return false;
    setNativeValue(selectEl, match.value);
    return true;
  };

  const fillSrivaniMember = async (person, index) => {
    if (!person || !person.name || !person.name.trim()) return;
    const nameEl = document.querySelector(`input[name="fName${index}"]`);
    if (nameEl) setNativeValue(nameEl, person.name);

    const ageEl = document.querySelector(`input[name="age${index}"]`);
    if (ageEl && person.age) {
      setNativeValue(ageEl, person.age);
      await sleep(400);
    }

    const genderEl = document.querySelector(`select[name="gender${index}"]`);
    if (genderEl && person.gender) setSelectByLabel(genderEl, person.gender);

    const proofEl = document.querySelector(`select[name="proofS${index}"]`);
    if (proofEl && person.idProof) {
      for (let i = 0; i < 20 && proofEl.options.length <= 1; i++) await sleep(150);
      const value = person.idProof === "Passport" ? "passport" : "aadha";
      setSelectByLabel(proofEl, value);
      await sleep(250);
    }

    const idEl = document.querySelector(`input[name="proofId${index}"]`);
    if (idEl && person.idNumber) setNativeValue(idEl, person.idNumber);
  };

  // Fills up to nine Srivani members, keeping the Continue button watched while
  // the SPA remounts. Shared by the popup message handler and the floating button.
  const fillSrivaniMembers = async (members) => {
    const stopWatching = watchForContinueButton();
    try {
      const first = document.querySelector('input[name="fName0"]');
      const form = first && first.closest("form");
      const formHidden = !!form && form.classList.contains("ng-hide");
      const startIndex = first && !formHidden && !(first.value || "").trim() ? 0 : 1;
      const upTo9 = (members || []).slice(0, 9);
      let filled = 0;
      for (let i = 0; i < upTo9.length; i++) {
        if (upTo9[i] && upTo9[i].name && upTo9[i].name.trim()) {
          announce("Filling Srivani member " + (i + 1) + " of " + upTo9.length);
          filled++;
        }
        await fillSrivaniMember(upTo9[i], startIndex + i);
        await sleep(150);
      }
      await sleep(400);
      clickContinueIfPresent();
      return { status: "success", filled };
    } finally {
      stopWatching();
    }
  };

  const isVisible = (el) => {
    if (!el || el.closest(".ng-hide, [hidden]")) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };

  // "Break Darshan" continue button: click it when it appears (and keep
  // re-clicking while the SPA remounts it) so the pilgrim step advances on its own.
  let lastAutoClick = 0;
  const clickContinueIfPresent = () => {
    const btn = document.querySelector("#pasok");
    if (!btn || !isVisible(btn)) return false;
    const now = Date.now();
    if (now - lastAutoClick < 1000) return false;
    lastAutoClick = now;
    btn.click();
    return true;
  };
  const watchForContinueButton = () => {
    clickContinueIfPresent();
    let observer = null;
    let pending = false;
    const trigger = () => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        clickContinueIfPresent();
      }, 150);
    };
    try {
      observer = new MutationObserver(trigger);
      observer.observe(document.body, { childList: true, subtree: true });
    } catch {}
    return () => observer && observer.disconnect();
  };

  const fillAllPilgrims = async (pilgrims, contact, onProgress) => {
    let nameInputs = Array.from(document.querySelectorAll('input[name="name"]'));
    if (nameInputs.length === 0) nameInputs = Array.from(document.querySelectorAll('input[name="fname"]'));
    if (nameInputs.length === 0) return { status: "error", message: "Name inputs not found" };

    const emptySlots = [];
    for (let i = 0; i < nameInputs.length; i++) {
      if (!nameInputs[i].value || nameInputs[i].value.trim() === "") emptySlots.push(i);
    }
    const count = Math.min(emptySlots.length, pilgrims.length);
    for (let i = 0; i < count; i++) {
      if (typeof onProgress === "function") onProgress(i + 1, count);
      announce("Filling pilgrim " + (i + 1) + " of " + count);
      await fillPilgrim(pilgrims[i], emptySlots[i], contact ? contact.country : undefined);
      await sleep(150);
    }
    if (contact) await fillContact(contact);
    return { status: "success", filled: count };
  };

  // ---- message handling: no license/paywall check, autofill runs immediately ----
  // Only this extension's own popup may drive a fill. Pages on the TTD site
  // cannot reach this listener (no `externally_connectable` is declared), but
  // the sender is checked anyway so a stray message can never move real data.
  const isOwnExtension = (sender) => !!sender && sender.id === chrome.runtime.id;

  // One fill at a time, whether triggered from the popup or the on-page button.
  const FILL_ACTIONS = new Set(["AUTOFILL", "FILL_SEVA", "FILL_ALL", "FILL_CONTACT", "FILL_SRIVANI"]);
  let globalFilling = false;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !isOwnExtension(sender)) return;

    if (FILL_ACTIONS.has(message.action)) {
      if (globalFilling) {
        sendResponse({ status: "error", message: "A fill is already running — please wait for it to finish." });
        return true;
      }
      globalFilling = true;
      const original = sendResponse;
      // Clear the lock whenever the handler responds (success or error), with a
      // safety timeout in case a handler never replies.
      let cleared = false;
      const release = () => {
        if (cleared) return;
        cleared = true;
        globalFilling = false;
      };
      setTimeout(release, 60000);
      sendResponse = (resp) => {
        release();
        try {
          original(resp);
        } catch {}
      };
    }

    if (message.action === "AUTOFILL") {
      const { pilgrim, contact } = message.data;
      (async () => {
        try {
          let nameInputs = Array.from(document.querySelectorAll('input[name="name"]'));
          if (nameInputs.length === 0) nameInputs = Array.from(document.querySelectorAll('input[name="fname"]'));
          if (nameInputs.length === 0) {
            sendResponse({ status: "error", message: "Name inputs not found" });
            return;
          }
          let slot = -1;
          for (let i = 0; i < nameInputs.length; i++) {
            if (!nameInputs[i].value || nameInputs[i].value.trim() === "") {
              slot = i;
              break;
            }
          }
          if (slot === -1 && nameInputs.length > 0) slot = nameInputs.length - 1;
          if (slot !== -1) await fillPilgrim(pilgrim, slot, contact.country);
          await fillContact(contact);
          sendResponse({ status: "success" });
        } catch (err) {
          sendResponse({ status: "error", message: err.message || err.toString() });
        }
      })();
      return true;
    }

    if (message.action === "FILL_SEVA") {
      const { sevakData } = message.data;
      (async () => {
        try {
          await fillSevaForm(sevakData, sevakData.memberIndex);
          sendResponse({ status: "success" });
        } catch (err) {
          sendResponse({ status: "error", message: err.message || err.toString() });
        }
      })();
      return true;
    }

    if (message.action === "FILL_ALL") {
      const { pilgrims, contact } = message.data;
      (async () => {
        try {
          const result = await fillAllPilgrims(pilgrims, contact);
          sendResponse(result);
        } catch (err) {
          sendResponse({ status: "error", message: err.toString() });
        }
      })();
      return true;
    }

    if (message.action === "FILL_CONTACT") {
      const { contact } = message.data;
      (async () => {
        try {
          await fillContact(contact);
          sendResponse({ status: "success" });
        } catch (err) {
          sendResponse({ status: "error", message: err.toString() });
        }
      })();
      return true;
    }

    if (message.action === "FILL_SRIVANI") {
      const { members } = message.data;
      (async () => {
        try {
          const result = await fillSrivaniMembers(members);
          sendResponse(result);
        } catch (err) {
          sendResponse({ status: "error", message: err.toString() });
        }
      })();
      return true;
    }
  });

  // ---- Seva (Srivari Seva / Group) form filler ----
  const fillSevaForm = async (data) => {
    let scope = document;
    if (typeof data.memberIndex === "number") {
      const containers = document.querySelectorAll('.profile_sevakContainer__APYsI, [class*="sevakContainer"]');
      if (containers.length > data.memberIndex) scope = containers[data.memberIndex];
      else if (containers.length > 0) scope = containers[containers.length - 1];
    }

    const pick = (selector) => {
      const nodes = Array.from(scope.querySelectorAll(selector));
      if (nodes.length === 0) return null;
      let found = nodes
        .slice()
        .reverse()
        .find((n) => {
          const rect = n.getBoundingClientRect();
          const visible = n.offsetParent !== null && rect.width > 0 && rect.height > 0;
          const empty = !n.value || n.value.trim() === "";
          return visible && empty;
        });
      if (found) return found;
      found = nodes
        .slice()
        .reverse()
        .find((n) => {
          const rect = n.getBoundingClientRect();
          return n.offsetParent !== null && rect.width > 0 && rect.height > 0;
        });
      return found || nodes[nodes.length - 1];
    };

    const setByName = (name, value) => {
      if (!value) return false;
      const el = pick(`input[name="${name}"]`);
      if (!el) return false;
      setNativeValue(el, value);
      return true;
    };

    const waitForNonEmpty = async (selector, timeout = 1000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const el = pick(selector);
        if (el && el.value && el.value.trim().length > 0) return el.value;
        await sleep(100);
      }
      return null;
    };

    const checkRadioGroupByValue = (name, value) => {
      if (!value) return;
      scope.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
        if (el.value.toLowerCase() === value.toLowerCase()) {
          el.checked = true;
          el.click();
          dispatchAll(el);
        }
      });
    };

    const setReadOnlyLikeInput = async (name, value) => {
      if (!value) return;
      const el = pick(`input[name="${name}"]`) || pick(`input#${name}`);
      if (el) setNativeValue(el, value);
    };

    await waitForNonEmpty('#idType, input[name="idType"], input[name="photoIdType"], input[name="spvrIdType"]', 400);

    const idType = (data.idType || "Aadhaar Card").trim();
    const idTypeEl =
      pick("#idType") || pick('input[name="idType"]') || pick('input[name="photoIdType"]') || pick('input[name="spvrIdType"]');

    const setDropdownRetrying = async (el, value, tries = 2) => {
      for (let attempt = 1; attempt <= tries; attempt++) {
        await selectFromDropdown(el, value);
        await sleep(80);
        if (el.value && el.value.trim() !== "") return true;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        if (setter) {
          setter.call(el, value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        await sleep(50);
        const propsKey = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
        if (propsKey) {
          const props = el[propsKey];
          if (props && props.onChange) {
            try {
              props.onChange({
                target: { value },
                currentTarget: { value },
                preventDefault: () => {},
                stopPropagation: () => {},
                persist: () => {},
                nativeEvent: new Event("change"),
              });
            } catch {}
          }
        }
        await sleep(150);
        if (el.value && el.value.trim() !== "") return true;
        el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
        document.body.click();
        await sleep(100);
      }
      return false;
    };

    const isAadhaar = idType.toLowerCase().includes("aadhaar");
    if (idTypeEl && !isAadhaar) await setDropdownRetrying(idTypeEl, idType);
    await sleep(150);

    setByName("idNumber", data.idNumber);
    setByName("spvrName", data.spvrName) || setByName("trainerName", data.spvrName);
    setByName("spvrRelativeName", data.spvrRelativeName) || setByName("trainerRelativeName", data.spvrRelativeName);
    await setReadOnlyLikeInput("dob", data.dob);
    await sleep(100);
    setByName("age", data.age);
    checkRadioGroupByValue("gender", data.gender?.toLowerCase());
    if (data.maritalStatus) {
      await selectFromDropdown(pick('input[name="maritalStatus"]'), data.maritalStatus);
      await sleep(50);
    }
    setByName("mobileNo", data.mobileNo);
    setByName("altMobileNo", data.altMobileNo);
    setByName("emailId", data.email) || setByName("email", data.email);
    setByName("residentialAdrs", data.residentialAdrs);
    setByName("pincode", data.pincode);

    if (data.country) {
      await selectFromDropdown(pick('input[name="country"]'), data.country);
      document.body.click();
      await sleep(50);
    }

    if (data.state) {
      const stateEl = pick('input[name="state"]');
      if (stateEl) {
        if (stateEl.readOnly) {
          await selectFromDropdown(stateEl, data.state);
          document.body.click();
          stateEl.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
          await sleep(200);
        } else {
          setNativeValue(stateEl, data.state);
          await sleep(50);
        }
      }
    }

    if (data.district) {
      const districtEl = pick('input[name="district"]');
      if (districtEl && !districtEl.readOnly) {
        setNativeValue(districtEl, data.district);
        await sleep(50);
      } else if (districtEl) {
        document.body.click();
        await sleep(100);
        let matched = false;
        for (let attempt = 0; attempt < 4 && !matched; attempt++) {
          if (attempt > 0) await sleep(150);
          const container = districtEl.closest('div[style*="position"]') || districtEl.parentElement?.parentElement || districtEl.parentElement;
          districtEl.click();
          districtEl.focus();
          districtEl.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
          await sleep(50);
          districtEl.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, view: window }));
          await sleep(100);

          let found = false;
          let items = [];
          for (let i = 0; i < 10; i++) {
            items = Array.from(
              (container || document).querySelectorAll(
                '[class*="floatingDropdown_listItem"], [class*="dropdown_scroll"] li, ul[style*="list-style-type: none"] li'
              )
            );
            if (items.length === 0 && container) {
              const parent = container.parentElement;
              if (parent) {
                items = Array.from(
                  parent.querySelectorAll(
                    '[class*="floatingDropdown_listItem"], [class*="dropdown_scroll"] li, ul[style*="list-style-type: none"] li'
                  )
                );
              }
            }
            if (items.length > 0) {
              found = true;
              break;
            }
            await sleep(100);
          }
          if (!found) {
            document.body.click();
            await sleep(100);
            continue;
          }
          const target = norm(data.district);
          let match = items.find((it) => {
            const text = it.innerText?.trim();
            return text && norm(text) === target;
          });
          if (!match) {
            match = items.find((it) => {
              const text = norm(it.innerText?.trim() || "");
              return text.startsWith(target) || target.startsWith(text);
            });
          }
          if (!match) {
            const stripSuffix = (s) => s.replace(/\s*(urban|rural|north|south|east|west)$/i, "").trim();
            const targetStripped = norm(stripSuffix(data.district));
            match = items.find((it) => {
              const text = norm(stripSuffix(it.innerText?.trim() || ""));
              return text.includes(targetStripped) || targetStripped.includes(text);
            });
          }
          if (match) {
            match.scrollIntoView?.({ block: "nearest" });
            match.click();
            await sleep(100);
            matched = districtEl.value && districtEl.value.trim().length > 0;
          }
          document.body.click();
          await sleep(50);
        }
        await sleep(50);
      }
    }

    setByName("city", data.city) || setByName("cityOrVillage", data.city);

    if (data.qualification) {
      const el = findByNameOrLabel("qualification", "Qualification Category") || findByNameOrLabel("qualificationCategory", "Qualification");
      if (el && (await selectFromDropdown(el, data.qualification))) await sleep(600);
    }
    if (data.specQualification) {
      const el = findByNameOrLabel("specQualification", "Specific Qualification") || findByNameOrLabel("specificQualification", "Qualification");
      if (el) {
        await selectFromDropdown(el, data.specQualification);
        await sleep(150);
      }
    }
    setByName("uniName", data.uniName);
    if (data.yearOfGraduation) {
      const el = findByNameOrLabel("yearOfGraduation", "Year of Graduation") || findByNameOrLabel("graduationYear", "Year");
      if (el) {
        await selectFromDropdown(el, data.yearOfGraduation);
        await sleep(100);
      }
    }
    setByName("eduSpecialization", data.eduSpecialization);
    if (data.employmentStatus) {
      const el = findByNameOrLabel("employmentStatus", "Employment Status") || findByNameOrLabel("employmentStatus", "Occupation Status");
      if (el) {
        await selectFromDropdown(el, data.employmentStatus);
        await sleep(150);
      }
    }
    if (data.employmentSector) {
      const el = findByNameOrLabel("employmentSector", "Employment Sector") || findByNameOrLabel("sector", "Sector");
      if (el) {
        await selectFromDropdown(el, data.employmentSector);
        await sleep(100);
      }
    }
    if (data.professionalCategory) {
      const el = findByNameOrLabel("professionalCategory", "Profession") || findByNameOrLabel("profession", "Professional Category");
      if (el && (await selectFromDropdown(el, data.professionalCategory))) await sleep(300);
    }
    if (data.specProfession) {
      const el = findByNameOrLabel("specProfession", "Profession Role") || findByNameOrLabel("professionRole", "Role");
      if (el) {
        await selectFromDropdown(el, data.specProfession);
        await sleep(100);
      }
    }
    setByName("profYearsOfExp", data.profYearsOfExp);
    checkRadioGroupByValue("previouslyVolunteered", data.previouslyVolunteered);
    if (data.previouslyVolunteered === "true") {
      await sleep(150);
      setByName("noOfParticipation", data.noOfParticipation);
      setByName("lastTwoSevaPeriods", data.lastTwoSevaPeriods);
      setByName("religiousInstitute", data.religiousInstitute);
      setByName("volunteeredExp", data.volunteeredExp);
    }

    if (data.experiencedTrainer !== undefined) {
      checkRadioGroupByValue("experiencedTrainer", data.experiencedTrainer);
      if (data.experiencedTrainer === "true") {
        await sleep(150);
        const inst = findByNameOrLabel("trainerInstituteName", "Organization / Institute Name");
        if (inst) setNativeValue(inst, data.trainerInstituteName);
        const role = findByNameOrLabel("trainerRole", "Your Role as Trainer");
        if (role) setNativeValue(role, data.trainerRole);
        const exp = findByNameOrLabel("trainerExp", "Experience");
        if (exp) setNativeValue(exp, data.trainerExp);

        if (data.areaOfTrainerExp && data.areaOfTrainerExp.length > 0) {
          const trigger = document.querySelector('input[name="areaOfTrainerExp"]');
          if (trigger) {
            trigger.click();
            await sleep(150);
            const options = document.querySelectorAll('[class*="checkboxListItem"], .floatingDropdown_checkboxListItem__AJXt6');
            for (const opt of options) {
              const label = opt.textContent?.trim();
              const isMatch = data.areaOfTrainerExp.some((wanted) => {
                const a = norm(wanted);
                const b = norm(label);
                return a === b || (a.includes("other") && b.includes("other") && b.includes("specify"));
              });
              if (isMatch) {
                const cb = opt.querySelector('input[type="checkbox"]');
                if (cb && !cb.checked) {
                  cb.click();
                  await sleep(100);
                }
              }
            }
            document.body.click();
            await sleep(100);
          }
        }
        if (
          data.areaOfTrainerExp?.some((a) => a.toLowerCase().includes("other") && a.toLowerCase().includes("specify")) &&
          data.otherAreaOfTrainerExp
        ) {
          await sleep(150);
          const el = findByNameOrLabel("otherAreaOfTrainerExp", "Other Area of Training Expertise");
          if (el) setNativeValue(el, data.otherAreaOfTrainerExp);
        }
      }
    }

    if (data.preferredLoc) {
      await selectFromDropdown(document.querySelector('input[name="preferredLoc"]'), data.preferredLoc);
      await sleep(150);
    }
    if (data.timeCommitment) {
      await selectFromDropdown(document.querySelector('input[name="timeCommitment"]'), data.timeCommitment);
      await sleep(150);
    }
    if (data.freq) {
      await selectFromDropdown(document.querySelector('input[name="freq"]'), data.freq);
      await sleep(150);
    }
    if (data.preferredLoc === "Other(Specify)" && data.otherPreferredLoc) {
      await sleep(150);
      setByName("otherPreferredLoc", data.otherPreferredLoc);
    }

    setByName("firstRefName", data.firstRefName);
    setByName("firstRefDetails", data.firstRefDetails);
    setByName("firstRefMobileNo", data.firstRefMobileNo);
    setByName("secRefName", data.secRefName);
    setByName("secRefDetails", data.secRefDetails);
    setByName("secRefMobileNo", data.secRefMobileNo);

    if (data.languages && Array.isArray(data.languages) && data.languages.length > 0) {
      const trigger = document.querySelector('input[name="languages"]');
      if (trigger) {
        trigger.click();
        trigger.focus();
        await sleep(200);
        for (const lang of data.languages) {
          const options = document.querySelectorAll('[class*="checkboxListItem"], li');
          for (const opt of options) {
            if (opt.textContent?.trim() === lang) {
              const cb = opt.querySelector('input[type="checkbox"]');
              if (cb && !cb.checked) {
                cb.click();
                await sleep(100);
              }
              break;
            }
          }
        }
        document.body.click();
        await sleep(100);
      }
    }

    const dataUrlToFile = (dataUrl, name, type) => {
      const binary = atob(dataUrl.split(",")[1]);
      const buffer = new ArrayBuffer(binary.length);
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new File([buffer], name, { type });
    };
    const applyFile = (input, fileMeta) => {
      const file = dataUrlToFile(fileMeta.data, fileMeta.name, fileMeta.type);
      const dt = new DataTransfer();
      dt.items.add(file); // a fresh DataTransfer replaces any previously staged file
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "files")?.set;
      if (setter) setter.call(input, dt.files);
      else input.files = dt.files;
      dispatchReactOnChange(input, fileMeta.name, { files: dt.files, type: "file" });
      input.dispatchEvent(new Event("change", { bubbles: true }));
      dispatchAll(input);
    };
    const setFileInput = async (input, fileMeta) => {
      if (!input || !fileMeta || !fileMeta.data) return false;
      try {
        applyFile(input, fileMeta);
        await sleep(80);
        // Verify the file actually attached; retry once if the UI dropped it.
        if (!(input.files && input.files.length === 1)) {
          applyFile(input, fileMeta);
          await sleep(120);
        }
        const ok = !!(input.files && input.files.length >= 1);
        flashField(input, ok);
        return ok;
      } catch {
        flashField(input, false);
        return false;
      }
    };

    if (data.photo && data.photo.data) {
      const containers = Array.from(
        scope.querySelectorAll('[class*="profile_photo-container"], [class*="photo-container"], [class*="photo-upload-container"]')
      );
      const container =
        containers
          .slice()
          .reverse()
          .find((c) => {
            const rect = c.getBoundingClientRect();
            return c.offsetParent !== null && rect.width > 0 && rect.height > 0;
          }) || containers[containers.length - 1];
      if (container) {
        const fileInput = container.parentElement?.querySelector('input[type="file"]') || container.nextElementSibling;
        if (fileInput && fileInput.type === "file") await setFileInput(fileInput, data.photo);
        else {
          const candidates = Array.from(scope.querySelectorAll('input[type="file"][accept*="jpeg"]'));
          const picked =
            candidates
              .slice()
              .reverse()
              .find((c) => {
                const rect = c.getBoundingClientRect();
                return c.offsetParent !== null || rect.width > 0;
              }) || candidates[candidates.length - 1];
          if (picked) await setFileInput(picked, data.photo);
        }
      }
      await sleep(250);
    }

    if (data.document && data.document.data) {
      const labels = document.querySelectorAll("label");
      let input = null;
      for (const label of labels) {
        if (label.textContent?.includes("Upload ID Proof")) {
          input = (label.closest('div[style*="position: relative"]') || label.closest("div"))?.querySelector('input[type="file"]');
          break;
        }
      }
      if (input) await setFileInput(input, data.document);
      else {
        const candidates = document.querySelectorAll('input[type="file"][accept*="jpeg"]');
        if (candidates.length > 1) await setFileInput(candidates[1], data.document);
      }
      await sleep(250);
    }

    if (data.eduCertificate && data.eduCertificate.data) {
      const labels = document.querySelectorAll("label");
      let input = null;
      for (const label of labels) {
        if (label.textContent?.includes("Upload Educational Certificate")) {
          input = (label.closest('div[style*="position: relative"]') || label.closest("div"))?.querySelector('input[type="file"]');
          break;
        }
      }
      if (input) await setFileInput(input, data.eduCertificate);
      else {
        const candidates = document.querySelectorAll('input[type="file"][accept*="jpeg"]');
        if (candidates.length > 2) await setFileInput(candidates[2], data.eduCertificate);
      }
      await sleep(250);
    }

    setByName("sevakName", data.sevakName);
    setByName("surName", data.surName);
    setByName("fatherOrSpouseName", data.fatherOrSpouseName);

    if (data.bloodGroup) {
      const el = pick('input[name="bloodGroup"]');
      if (el) {
        await selectFromDropdown(el, data.bloodGroup);
        await sleep(200);
      }
    }

    if (data.mentallyFit || data.physicallyFit) {
      let root = scope;
      if (!root || !root.querySelectorAll) root = document;
      const groups = Array.from(root.querySelectorAll('#fitness, [id*="fitness"]'));
      let group;
      if (groups.length > 0) {
        group =
          groups
            .slice()
            .reverse()
            .find((g) => {
              const rect = g.getBoundingClientRect();
              return g.offsetParent !== null && rect.width > 0 && rect.height > 0;
            }) || groups[groups.length - 1];
      } else {
        group = Array.from(root.querySelectorAll('div[class*="radioGroup"], .profile_radioGroup__RkVE_')).find((g) =>
          g.textContent.includes("Mentally Fit")
        );
      }
      if (group) {
        const checkboxes = Array.from(group.querySelectorAll('input[type="checkbox"][name="fitness"]'));
        for (const cb of checkboxes) {
          const label = cb.closest("label")?.textContent?.toLowerCase() || "";
          let shouldCheck = false;
          if (data.mentallyFit && label.includes("mentally") && !cb.checked) shouldCheck = true;
          if (data.physicallyFit && label.includes("physically") && !cb.checked) shouldCheck = true;
          if (shouldCheck) {
            const propsKey = Object.keys(cb).find((k) => k.startsWith("__reactProps$"));
            let handled = false;
            if (propsKey && cb[propsKey]?.onChange) {
              try {
                cb[propsKey].onChange({
                  target: { checked: true, type: "checkbox", name: "fitness" },
                  currentTarget: { checked: true, type: "checkbox", name: "fitness" },
                  preventDefault: () => {},
                  stopPropagation: () => {},
                  persist: () => {},
                  nativeEvent: new Event("change"),
                });
                handled = true;
              } catch {}
            }
            if (!handled || !cb.checked) cb.click();
            await sleep(150);
          }
        }
      }
    }

    setByName("street", data.street);
    setByName("doorNo", data.doorNo);
    if (data.nearestTtdTemple) {
      const el = pick('input[name="nearestTtdTemple"]');
      if (el) {
        await selectFromDropdown(el, data.nearestTtdTemple);
        await sleep(200);
      }
    }
    setByName("qualification", data.volunteerQualification);
    setByName("profession", data.volunteerProfession);
    setByName("employeeId", data.employeeId);
    setByName("designation", data.designation);
    setByName("specialisation", data.specialisation);
    setByName("placeOfWork", data.placeOfWork);

    const forceSetValue = async (el, value) => {
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(el, value);
      else el.value = value;
      const propsKey = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
      if (propsKey) {
        const props = el[propsKey];
        if (props && props.onChange) {
          try {
            props.onChange({
              target: { value },
              currentTarget: { value },
              preventDefault: () => {},
              stopPropagation: () => {},
              persist: () => {},
              nativeEvent: new Event("change"),
            });
          } catch {}
        }
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      await sleep(50);
      return el.value === value;
    };

    for (let attempt = 1; attempt <= 3 && data.professionalCategory; attempt++) {
      const el = findByNameOrLabel("professionalCategory", "Profession") || findByNameOrLabel("profession", "Professional Category");
      if (el && (!el.value || el.value.trim() === "")) {
        await selectFromDropdown(el, data.professionalCategory);
        await sleep(250);
        if (!el.value || el.value.trim() === "") await forceSetValue(el, data.professionalCategory);
        await sleep(200);
        if (data.specProfession) {
          const roleEl = findByNameOrLabel("specProfession", "Profession Role") || findByNameOrLabel("professionRole", "Role");
          if (roleEl && (!roleEl.value || roleEl.value.trim() === "")) {
            await selectFromDropdown(roleEl, data.specProfession);
            await sleep(150);
            if (!roleEl.value || roleEl.value.trim() === "") await forceSetValue(roleEl, data.specProfession);
          }
        }
      } else if (el && el.value) {
        if (data.specProfession) {
          const roleEl = findByNameOrLabel("specProfession", "Profession Role") || findByNameOrLabel("professionRole", "Role");
          if (roleEl && (!roleEl.value || roleEl.value.trim() === "")) {
            await selectFromDropdown(roleEl, data.specProfession);
            await sleep(150);
            if (!roleEl.value || roleEl.value.trim() === "") await forceSetValue(roleEl, data.specProfession);
          } else break;
        } else break;
      } else break;
    }

    const idTypeFinal = (data.idType || "Aadhaar Card").trim();
    if (!idTypeFinal.toLowerCase().includes("aadhaar")) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const el = pick("#idType") || pick('input[name="idType"]') || pick('input[name="photoIdType"]') || pick('input[name="spvrIdType"]');
        if (el && (!el.value || el.value.trim() === "")) {
          await selectFromDropdown(el, idTypeFinal);
          await sleep(200);
          if (!el.value || el.value.trim() === "") await forceSetValue(el, idTypeFinal);
          await sleep(100);
          if (data.idNumber) setByName("idNumber", data.idNumber);
          if (el.value && el.value.trim() !== "") break;
        } else break;
      }
    }
    if (data.idNumber) {
      const el = pick('input[name="idNumber"]');
      if (el && (!el.value || el.value.trim() === "")) setByName("idNumber", data.idNumber);
    }

    if (data.professionalCategory) {
      const el = findByNameOrLabel("professionalCategory", "Profession") || findByNameOrLabel("profession", "Professional Category");
      if (el) {
        await forceSetValue(el, data.professionalCategory);
        await sleep(200);
      }
    }
    if (data.specProfession) {
      const el = findByNameOrLabel("specProfession", "Profession Role") || findByNameOrLabel("professionRole", "Role");
      if (el) {
        await forceSetValue(el, data.specProfession);
        await sleep(100);
      }
    }

    const isAadhaarFinal = idTypeFinal.toLowerCase().includes("aadhaar");
    const idTypeElFinal = pick("#idType") || pick('input[name="idType"]') || pick('input[name="photoIdType"]') || pick('input[name="spvrIdType"]');
    if (!isAadhaarFinal && idTypeElFinal && (!idTypeElFinal.value || idTypeElFinal.value.trim() === "")) {
      await forceSetValue(idTypeElFinal, idTypeFinal);
      if (idTypeElFinal.closest(".MuiFormControl-root") || idTypeElFinal.closest(".form-group") || idTypeElFinal.parentElement?.parentElement) {
        if (!document.querySelector('[role="listbox"]') && !document.querySelector(".MuiAutocomplete-listbox")) {
          idTypeElFinal.focus();
          idTypeElFinal.click();
          await sleep(100);
        }
        const options = document.querySelectorAll('[role="option"], li[data-option-index]');
        for (const opt of options) {
          if (opt.textContent.toLowerCase().includes(idTypeFinal.toLowerCase())) {
            opt.click();
            break;
          }
        }
      }
      await sleep(100);
    }
    if (data.idNumber) {
      const el = pick('input[name="idNumber"]');
      if (el && (!el.value || el.value.trim() === "")) setByName("idNumber", data.idNumber);
    }

    if (data.clickSaveAndAdd !== false) {
      await sleep(400);
      const saveBtn = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.trim().includes("Save and Add Sevak") && !b.disabled
      );
      if (saveBtn) {
        saveBtn.click();
        for (let i = 0; i < 30; i++) {
          await sleep(50);
          const dialogs = document.querySelectorAll('[role="dialog"]');
          for (const dialog of dialogs) {
            const text = dialog.textContent || "";
            if (text.toLowerCase().includes("validation") || text.toLowerCase().includes("alert")) {
              const subtitle = dialog.querySelector('[class*="subTitle"]');
              const message = subtitle ? subtitle.textContent.trim() : "Backend validation failed";
              const retryBtn = Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent?.includes("Retry"));
              const closeIcon = dialog.querySelector('img[src*="cross"]');
              if (retryBtn) retryBtn.click();
              else if (closeIcon) closeIcon.click();
              throw new Error(`Validation Modal Error: ${message}`);
            }
          }
        }
      }
    }
  };

  // ---- Floating action button injected on supported TTD pages ----
  (function () {
    const BTN_ID = "ttdfh-fill-button";
    const STYLE_ID = BTN_ID + "-style";
    let busy = false;

    // Detect which TTD booking form is on the page so the button can fill the
    // right one automatically (no need to open the popup first).
    function detectFormType() {
      if (document.querySelector('input[name="fName0"], input[name="fName1"]')) return "srivani";
      if (document.querySelector('input[name="sevakName"], input[name="spvrName"], [class*="sevakContainer"]')) return "seva";
      if (document.querySelector('input[name="name"], input[name="fname"]')) return "pilgrim";
      return null;
    }
    function hasBookingForm() {
      return detectFormType() !== null;
    }
    const FORM_LABELS = {
      pilgrim: "Fill Pilgrims",
      seva: "Fill Sevak",
      srivani: "Fill Srivani",
    };
    function formLabel(type) {
      return FORM_LABELS[type] || "Fill Details";
    }

    // Delegates to the shared on-page toast (also announces to screen readers).
    function showToast(message, kind) {
      toast(message, kind);
    }

    const isEncryptedValue = (v) => !!v && typeof v === "object" && v.__tfhEnc === 1 && v.iv && v.ct;

    // Reads saved pilgrims. Normally that's a direct storage read; when the user
    // has switched on at-rest encryption the data is ciphertext here, so we ask
    // the extension's background worker (which can reach the session key) to
    // hand back the decrypted copy.
    async function loadSavedData() {
      const stored = await chrome.storage.local.get(["pilgrims", "contact"]);
      if (!isEncryptedValue(stored.pilgrims) && !isEncryptedValue(stored.contact)) return stored;

      const response = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: "TFH_SECURE_GET", keys: ["pilgrims", "contact"] }, (r) => {
            if (chrome.runtime.lastError) resolve(null);
            else resolve(r);
          });
        } catch {
          resolve(null);
        }
      });
      if (!response || !response.ok) {
        const err = new Error(response && response.error === "VAULT_LOCKED" ? "VAULT_LOCKED" : "READ_FAILED");
        throw err;
      }
      return response.data || {};
    }

    function setBusy(on) {
      busy = on;
      const btn = document.getElementById(BTN_ID);
      if (btn) btn.classList.toggle("ttdfh-busy", on);
      if (!on) setProgress("");
    }

    function setProgress(text) {
      const el = document.getElementById("ttdfh-progress");
      if (!el) return;
      el.textContent = text || "";
      el.style.display = text ? "block" : "none";
    }

    // Reads a plaintext storage key for the on-page button. Seva/Srivani data
    // can't be decrypted here when at-rest encryption is on (only pilgrims and
    // contact can, via the background worker), so an encrypted blob returns a
    // locked signal and the user is pointed at the popup.
    async function loadPlainKey(key) {
      const stored = await chrome.storage.local.get([key]);
      const value = stored[key];
      if (isEncryptedValue(value)) return { locked: true };
      return { value };
    }

    function handleFillError(err) {
      const message = (err && err.message) || "";
      if (message === "VAULT_LOCKED") {
        showToast("🔒 Your data is locked — open TTD Form Helper and unlock it first.", "warn");
      } else if (/extension context invalidated/i.test(message) || !chrome.runtime?.id) {
        removeButton();
        showToast("Extension was reloaded — refresh this TTD page to use autofill.", "warn");
      } else {
        showToast(message || "Fill failed — try reloading the TTD page.", "error");
      }
    }

    function scrollToFirstEmpty(selector) {
      try {
        const first = Array.from(document.querySelectorAll(selector)).find(
          (el) => isOnScreen(el) && (!el.value || !el.value.trim())
        );
        if (first) first.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      } catch {}
    }

    async function runPilgrimFill() {
      const stored = await loadSavedData();
      const pilgrims = stored.pilgrims || [];
      const contact = stored.contact || {};
      if (!pilgrims.length) {
        showToast("No pilgrims saved — open the extension to add them.", "warn");
        return;
      }
      const result = await fillAllPilgrims(pilgrims, contact, (done, total) => setProgress(done + "/" + total + " pilgrims…"));
      if (result.status === "success") {
        showToast("⚡ Filled " + result.filled + " pilgrim" + (result.filled === 1 ? "" : "s") + ".", "success");
        scrollToFirstEmpty('input[name="name"], input[name="fname"]');
      } else {
        showToast(result.message || "Could not fill this page.", "error");
      }
    }

    async function runSrivaniFill() {
      const { value, locked } = await loadPlainKey("srivaniPeople");
      if (locked) {
        showToast("🔒 Srivani data is locked — open the extension popup to fill it.", "warn");
        return;
      }
      const members = Array.isArray(value) ? value.filter((p) => p && p.name && p.name.trim()) : [];
      if (!members.length) {
        showToast("No Srivani members saved — open the extension to add them.", "warn");
        return;
      }
      const result = await fillSrivaniMembers(members);
      showToast("🪔 Filled " + result.filled + " Srivani member" + (result.filled === 1 ? "" : "s") + ".", "success");
    }

    async function runSevaFill() {
      const { value, locked } = await loadPlainKey("sevakData");
      if (locked) {
        showToast("🔒 Seva data is locked — open the extension popup to fill it.", "warn");
        return;
      }
      if (!value || (!value.sevakName && !value.spvrName && !value.mobileNo)) {
        showToast("No Sevak details saved — open the extension to add them.", "warn");
        return;
      }
      // One-click helper fills only; the user reviews and submits themselves.
      await fillSevaForm({ ...value, clickSaveAndAdd: false });
      showToast("🙏 Sevak details filled — review, then Save & Add Sevak.", "success");
    }

    async function onFillClick() {
      if (busy) return;
      if (globalFilling) {
        showToast("A fill is already running — please wait.", "warn");
        return;
      }
      const type = detectFormType();
      if (!type) {
        showToast("Open a TTD booking form first.", "warn");
        return;
      }
      setBusy(true);
      globalFilling = true;
      try {
        if (type === "srivani") await runSrivaniFill();
        else if (type === "seva") await runSevaFill();
        else await runPilgrimFill();
      } catch (err) {
        handleFillError(err);
      } finally {
        globalFilling = false;
        setBusy(false);
      }
    }

    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || "") || /mac/i.test((navigator.userAgentData && navigator.userAgentData.platform) || "");
    const shortcutLabel = isMac ? "⌥A" : "Alt+A";
    const shortcutFull = isMac ? "Option + A" : "Alt + A";

    function ensureStyles() {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        #ttdfh-fab-wrap {
          position: fixed;
          right: 22px;
          bottom: 22px;
          z-index: 2147483646;
          font-family: system-ui, -apple-system, sans-serif;
        }
        #${BTN_ID} {
          position: relative;
          width: 58px;
          height: 58px;
          border: 2px solid rgba(255, 255, 255, .55);
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          background: linear-gradient(160deg, #FFB03B 0%, #C42F3B 100%);
          color: #fff;
          box-shadow: 0 10px 28px rgba(196,47,59,.4), inset 0 2px 6px rgba(255,255,255,.25);
          opacity: 1;
          transition: transform .18s ease, box-shadow .18s ease;
          animation: ttdfh-in .25s ease-out;
        }
        #${BTN_ID}:hover, #${BTN_ID}:focus-visible {
          transform: scale(1.08);
          box-shadow: 0 14px 36px rgba(196,47,59,.5), 0 0 0 6px rgba(255,176,59,.22);
          outline: none;
        }
        #${BTN_ID}:active { transform: scale(.95); }
        #${BTN_ID}.ttdfh-busy { pointer-events: none; filter: saturate(.75) brightness(.95); }
        #${BTN_ID}.ttdfh-busy .ttdfh-icon { display: none; }
        #${BTN_ID}.ttdfh-busy::after {
          content: '';
          width: 20px;
          height: 20px;
          border: 3px solid rgba(255, 255, 255, .4);
          border-top-color: #fff;
          border-radius: 50%;
          animation: ttdfh-spin .7s linear infinite;
        }
        #${BTN_ID} .ttdfh-icon { display: flex; line-height: 1; font-size: 24px; }
        #${BTN_ID} .ttdfh-kbd {
          position: absolute;
          right: -3px;
          bottom: -3px;
          background: #1E9E5C;
          color: #fff;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .02em;
          padding: 2px 6px;
          border-radius: 999px;
          box-shadow: 0 2px 8px rgba(0,0,0,.35);
        }
        #ttdfh-progress {
          position: absolute;
          right: 0;
          bottom: 66px;
          background: rgba(30, 20, 20, .97);
          color: #fff;
          font: 700 11px/1.3 system-ui, -apple-system, sans-serif;
          padding: 5px 10px;
          border-radius: 999px;
          white-space: nowrap;
          box-shadow: 0 8px 22px rgba(0,0,0,.4);
        }
        #ttdfh-fab-wrap .ttdfh-pop {
          position: absolute;
          right: 72px;
          bottom: 0;
          transform: translateX(12px);
          width: max-content;
          max-width: 250px;
          background: rgba(30, 20, 20, .97);
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 14px;
          padding: 12px 14px;
          color: #fff;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: opacity .18s ease, transform .18s ease, visibility .18s;
          box-shadow: 0 18px 50px rgba(0,0,0,.5);
          text-align: left;
        }
        #ttdfh-fab-wrap .ttdfh-pop-title { font-size: 12.5px; font-weight: 700; margin-bottom: 7px; }
        #ttdfh-fab-wrap .ttdfh-pop-kbd-row { display: flex; align-items: center; gap: 7px; font-size: 10.5px; opacity: .75; }
        #ttdfh-fab-wrap kbd {
          background: rgba(255,255,255,.12);
          border: 1px solid rgba(255,255,255,.18);
          border-bottom-width: 2px;
          border-radius: 6px;
          padding: 2px 6px;
          font: 700 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
          color: #fff;
        }
        #ttdfh-fab-wrap:hover .ttdfh-pop, #ttdfh-fab-wrap:focus-within .ttdfh-pop {
          opacity: 1; visibility: visible; pointer-events: auto; transform: translateX(0);
        }
        @media (max-width: 480px) {
          #ttdfh-fab-wrap .ttdfh-pop { right: 0; bottom: 70px; transform: translateY(12px); }
          #ttdfh-fab-wrap:hover .ttdfh-pop, #ttdfh-fab-wrap:focus-within .ttdfh-pop { transform: translateY(0); }
        }
        @keyframes ttdfh-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ttdfh-spin { to { transform: rotate(360deg); } }
        @keyframes ttdfh-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          #${BTN_ID} { animation: none; transition: none; }
          #${BTN_ID}:hover, #${BTN_ID}:focus-visible, #${BTN_ID}:active { transform: none; }
        }
      `;
      document.head.appendChild(style);
    }

    function removeButton() {
      const wrap = document.getElementById("ttdfh-fab-wrap");
      if (wrap) wrap.remove();
      const style = document.getElementById(STYLE_ID);
      if (style) style.remove();
    }

    function updateLabel(type) {
      const label = formLabel(type);
      const btn = document.getElementById(BTN_ID);
      if (btn) btn.setAttribute("aria-label", label + ". Shortcut: " + shortcutFull);
      const title = document.getElementById("ttdfh-pop-title");
      if (title) title.textContent = label;
    }

    function injectButton(type) {
      if (document.getElementById(BTN_ID)) {
        updateLabel(type);
        return;
      }
      ensureStyles();
      const wrap = document.createElement("div");
      wrap.id = "ttdfh-fab-wrap";

      const progress = document.createElement("div");
      progress.id = "ttdfh-progress";
      progress.setAttribute("aria-hidden", "true");
      progress.style.display = "none";
      wrap.appendChild(progress);

      const btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.type = "button";
      btn.setAttribute("aria-label", formLabel(type) + ". Shortcut: " + shortcutFull);
      btn.innerHTML = '<span class="ttdfh-icon" aria-hidden="true">⚡</span><span class="ttdfh-kbd" aria-hidden="true">' + shortcutLabel + "</span>";
      btn.addEventListener("click", onFillClick);
      wrap.appendChild(btn);

      const pop = document.createElement("div");
      pop.className = "ttdfh-pop";
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-label", "Fill booking details");
      pop.innerHTML =
        '<div class="ttdfh-pop-title" id="ttdfh-pop-title">' +
        formLabel(type) +
        '</div><div class="ttdfh-pop-kbd-row"><span>Shortcut</span><kbd>' +
        (isMac ? "⌥" : "Alt") +
        "</kbd><kbd>A</kbd></div>";
      wrap.appendChild(pop);

      document.body.appendChild(wrap);
    }

    // Re-runs on DOM changes so the button stays correct as the SPA moves
    // between booking steps (pilgrim → seva → srivani) without a full reload.
    function sync() {
      const type = detectFormType();
      if (type) injectButton(type);
      else removeButton();
    }

    window.addEventListener("keydown", (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === "KeyA") {
        if (!hasBookingForm()) return;
        e.preventDefault();
        onFillClick();
      }
    });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync);
    else sync();

    let debounceTimer;
    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(sync, 600);
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  })();
})();
