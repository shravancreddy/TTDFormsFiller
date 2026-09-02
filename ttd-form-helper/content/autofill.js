// TTD Form Helper — content script.
// Fills the pilgrim / seva / srivani booking forms on the official TTD sites.
// Free for every user — no license, pass, or payment gate on any action.
(function () {
  // Chrome/Edge expose `chrome`; Firefox and Safari expose `browser`.
  const chrome = globalThis.chrome ?? globalThis.browser;

  // A real "tab out" of a field, done at full speed.
  //
  // React 17+ does not listen for the `blur` event at all — it wires onBlur to
  // the native, bubbling `focusout`. So `new Event("blur", {bubbles:true})`,
  // which is what this used to dispatch, never reached the page's validator:
  // a field could hold the right value while the site still showed "this field
  // is required" and kept its Continue button disabled, because as far as the
  // form library was concerned the field had never been visited or re-checked.
  // Driving focus() → blur() makes the browser emit the genuine
  // focus/focusin/blur/focusout sequence instead, which is what actually
  // clears that error. Comboboxes are skipped (focusing one re-opens its
  // floating list); they get the event pair directly, and selectFromDropdown
  // does its own blur/outside-click at the end.
  const tabOut = (el) => {
    try {
      if (!looksLikeCombobox(el) && typeof el.focus === "function") {
        el.focus({ preventScroll: true });
        if (document.activeElement === el) {
          el.blur(); // real blur + focusout, straight from the browser
          return;
        }
      }
    } catch {}
    // Not focusable (or a combobox): synthesize both, `focusout` being the one
    // React and most form libraries actually subscribe to.
    try {
      el.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
      el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    } catch {}
  };

  const dispatchAll = (el) => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    tabOut(el);
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

  // ---- Self-QC: track every field a fill touches, then mark filled (green) vs
  // blank/failed (red) once the run finishes, with a small on-page summary. ----
  const QC_STYLE_ID = "ttdfh-qc-style";
  const ensureQCStyles = () => {
    if (document.getElementById(QC_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = QC_STYLE_ID;
    style.textContent = `
      .ttdfh-qc-ok { box-shadow: 0 0 0 2px rgba(30,158,92,.85) !important; border-radius: 6px; }
      .ttdfh-qc-missing { box-shadow: 0 0 0 2px rgba(220,38,38,.9) !important; border-radius: 6px; }
      .ttdfh-qc-dot {
        position: fixed; width: 9px; height: 9px; border-radius: 50%;
        pointer-events: none; z-index: 2147483647; box-shadow: 0 0 0 2px #fff, 0 1px 3px rgba(0,0,0,.35);
      }
      .ttdfh-qc-dot-ok { background: #1E9E5C; }
      .ttdfh-qc-dot-missing { background: #DC2626; }
    `;
    (document.head || document.documentElement).appendChild(style);
  };

  // Fields that make up the booking form: any visible, enabled text-ish
  // input/select/textarea on the page, plus file inputs (which the site often
  // hides behind a styled upload button, so those skip the visibility check).
  // This is a *live* scan of the whole page — not a list of fields this run
  // happened to write to — so a pilgrim row filled by hand, or left over from
  // an earlier fill, is checked exactly the same as one this run just wrote.
  const QC_FIELD_SELECTOR =
    'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]):not([type="search"]), select, textarea';
  const isOwnInjectedNode = (el) => !!el.closest('[id^="ttdfh-"]');
  const collectFormFields = () => {
    const out = [];
    const seenRadioNames = new Set();
    document.querySelectorAll(QC_FIELD_SELECTOR).forEach((el) => {
      if (isOwnInjectedNode(el)) return;
      if (el.type === "file") {
        if (!el.disabled) out.push(el);
        return;
      }
      if (el.disabled) return;
      if (el.readOnly && !looksLikeCombobox(el)) return; // static/derived, not user-facing
      if (!isVisible(el)) return; // not on the currently active step
      if (el.type === "radio") {
        const key = el.name || el;
        if (seenRadioNames.has(key)) return; // one representative per radio group
        seenRadioNames.add(key);
      }
      out.push(el);
    });
    return out;
  };

  const qcFieldStatus = (el) => {
    if (!el || !el.isConnected) return null; // removed from the DOM — nothing to report
    if (el.type === "file") return !!(el.files && el.files.length > 0);
    if (el.type === "radio") {
      // A tracked radio is just one representative of its group — the group
      // "has a value" once any radio sharing its name is checked.
      if (!el.name) return !!el.checked;
      const esc = (window.CSS && CSS.escape) ? CSS.escape(el.name) : el.name;
      const root = el.form || document;
      return !!root.querySelector(`input[name="${esc}"]:checked`);
    }
    if (el.type === "checkbox") return !!el.checked;
    return !!(el.value && el.value.toString().trim());
  };
  const qcFieldLabel = (el) => {
    if (!el) return "field";
    if (el.id) {
      const lab = document.querySelector(`label[for="${(window.CSS && CSS.escape) ? CSS.escape(el.id) : el.id}"]`);
      if (lab && lab.textContent.trim()) return lab.textContent.trim();
    }
    const aria = el.getAttribute("aria-label");
    if (aria) return aria;
    const wrapLabel = el.closest("label");
    if (wrapLabel && wrapLabel.textContent.trim()) return wrapLabel.textContent.trim();
    return el.placeholder || el.name || el.id || "field";
  };

  // Clears the previous run's marks/dots and their scroll listener, if any.
  let qcCleanup = null;
  const clearQC = () => {
    if (qcCleanup) {
      qcCleanup();
      qcCleanup = null;
    }
  };

  // Scans every field currently on the page, marks each green (has a value)
  // or red (still blank) with a persistent ring + small dot, and shows a
  // one-line pass/fail summary. Checkboxes and unselected radio groups are
  // credited when set but never red-flagged when not — "unchecked" is a
  // legitimate final state for most of those (optional multi-selects, etc.)
  // and flagging them all would just be noise. Marks persist for a while so
  // the user can spot problem fields at a glance, then clear automatically
  // (or immediately on the next fill).
  const runFieldQC = () => {
    ensureQCStyles();
    clearQC();

    const fields = collectFormFields();
    const entries = [];
    const marked = [];
    let okCount = 0;
    const missingLabels = [];
    let firstMissingEl = null;

    const mark = (el, ok) => {
      el.classList.add(ok ? "ttdfh-qc-ok" : "ttdfh-qc-missing");
      marked.push(el);
      if (ok) okCount++;
      else {
        missingLabels.push(qcFieldLabel(el));
        if (!firstMissingEl) firstMissingEl = el;
      }
      if (isOnScreen(el)) {
        const dot = document.createElement("div");
        dot.className = "ttdfh-qc-dot " + (ok ? "ttdfh-qc-dot-ok" : "ttdfh-qc-dot-missing");
        document.body.appendChild(dot);
        entries.push({ el, dot });
      }
    };

    for (const el of fields) {
      if (el.type === "checkbox") {
        if (el.checked) mark(el, true); // unchecked: optional, not flagged
        continue;
      }
      if (el.type === "radio") {
        if (qcFieldStatus(el)) mark(el, true); // no selection: optional, not flagged
        continue;
      }
      mark(el, qcFieldStatus(el));
    }

    const reposition = () => {
      for (const { el, dot } of entries) {
        if (!el.isConnected || !isOnScreen(el)) {
          dot.style.display = "none";
          continue;
        }
        const rect = el.getBoundingClientRect();
        dot.style.display = "block";
        dot.style.left = rect.right - 4 + "px";
        dot.style.top = rect.top - 4 + "px";
      }
    };
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);

    const cleanup = () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      entries.forEach(({ dot }) => dot.remove());
      marked.forEach((el) => el.classList.remove("ttdfh-qc-ok", "ttdfh-qc-missing"));
    };
    qcCleanup = cleanup;
    setTimeout(() => {
      if (qcCleanup === cleanup) {
        cleanup();
        qcCleanup = null;
      }
    }, 20000);

    const total = okCount + missingLabels.length;
    if (total > 0) {
      if (missingLabels.length === 0) {
        toast(`✅ Self-QC: all ${okCount} field${okCount === 1 ? "" : "s"} on this page are filled.`, "success");
      } else {
        const shown = missingLabels.slice(0, 4).join(", ") + (missingLabels.length > 4 ? "…" : "");
        toast(`⚠ Self-QC: ${okCount}/${total} fields filled. Blank: ${shown}`, "warn");
        if (firstMissingEl) {
          try {
            firstMissingEl.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
          } catch {}
        }
      }
    }
    return { ok: okCount, missing: missingLabels.length, missingLabels };
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
  // ---- Undo log: remember the prior value of each field a fill writes ----
  // Recording is unconditional. It used to be gated on a `logging` flag that
  // only the floating button switched on, so a fill started from the popup
  // left the log empty and "Clear filled fields" reported nothing to clear.
  let fillLog = new Map();
  const beginLog = () => {
    fillLog = new Map();
  };
  const recordPrev = (el) => {
    if (!el || fillLog.has(el)) return;
    try {
      fillLog.set(el, el.value ?? "");
    } catch {}
  };

  // Writes a value to a plain (non-dropdown) input: native prototype setter +
  // input/change/blur, then the React onChange path if the framework ignored the
  // native write. Highlights the field green when the value stuck, amber if not.
  const setControlledValue = (el, value) => {
    if (!el) return false;
    recordPrev(el);
    const target = value == null ? "" : String(value);
    const previous = el.value ?? "";
    const desc = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value");
    if (desc && desc.set) desc.set.call(el, target);
    else el.value = target;
    // React keeps a private value tracker on the node and ignores an `input`
    // event whose value matches what it last recorded. Rewinding the tracker to
    // the pre-write value guarantees it sees a genuine change and runs its
    // onChange — without this, a field can carry the right text while React's
    // own state stays empty, which is what leaves the site's Continue button
    // disabled and its "required" error showing.
    try {
      const tracker = el._valueTracker;
      if (tracker && typeof tracker.setValue === "function" && previous !== target) {
        tracker.setValue(previous);
      }
    } catch {}
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
    recordPrev(el);
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
  // A single paint's worth of yield (~16ms) — far cheaper than a fixed
  // 100ms+ sleep, but still gives the page's own React reconciliation a
  // chance to run before the next synchronous write, which a zero-wait loop
  // can race (and, on this site, occasionally lose — see fillPilgrim).
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

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

  // Contact details are stored on the pilgrim (TTD asks for one set per
  // booking, not per person). Whatever the caller passed in wins; anything it
  // is missing is taken, field by field, from the first pilgrim in this run
  // who has that field set.
  const CONTACT_FALLBACK_FIELDS = ["email", "city", "state", "country", "pincode", "gothram"];
  const resolveEffectiveContact = (contact, pilgrims) => {
    const base = { ...(contact || {}) };
    for (const field of CONTACT_FALLBACK_FIELDS) {
      if (base[field]) continue;
      const donor = (pilgrims || []).find((p) => p && p[field]);
      if (donor) base[field] = donor[field];
    }
    return base;
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

    // Plain inputs write and dispatch their events synchronously, so a fixed
    // 100ms+ pause between them was dead time — but a *zero*-wait loop can
    // still race a re-render the page's own listeners trigger off that
    // dispatch, silently losing a write. A single-frame yield (~16ms) splits
    // the difference: still 6-9x faster than the old fixed sleeps, but gives
    // the page a paint cycle between writes so nothing gets dropped.
    const nameEl = nthByNames(index, "name", "fname");
    if (nameEl) setNativeValue(nameEl, pilgrim.name);
    await nextFrame();

    const ageEl = byIndex("age");
    if (ageEl) setNativeValue(ageEl, pilgrim.age);
    await nextFrame();

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
    await nextFrame();

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

  const fillAllPilgrims = async (pilgrims, contact, opts = {}) => {
    const { onProgress, overwrite = false } = opts;
    contact = resolveEffectiveContact(contact, pilgrims);
    let nameInputs = Array.from(document.querySelectorAll('input[name="name"]'));
    if (nameInputs.length === 0) nameInputs = Array.from(document.querySelectorAll('input[name="fname"]'));
    if (nameInputs.length === 0) return { status: "error", message: "Name inputs not found" };

    // "Only empty" (default) skips rows that already hold a value; "overwrite"
    // fills the first N rows regardless of what's in them.
    let slots;
    if (overwrite) {
      slots = [];
      const n = Math.min(nameInputs.length, pilgrims.length);
      for (let i = 0; i < n; i++) slots.push(i);
    } else {
      slots = [];
      for (let i = 0; i < nameInputs.length; i++) {
        if (!nameInputs[i].value || nameInputs[i].value.trim() === "") slots.push(i);
      }
    }
    const count = Math.min(slots.length, pilgrims.length);
    for (let i = 0; i < count; i++) {
      if (typeof onProgress === "function") onProgress(i + 1, count);
      announce("Filling pilgrim " + (i + 1) + " of " + count);
      await fillPilgrim(pilgrims[i], slots[i], contact ? contact.country : undefined);
      // A single-frame yield (not a fixed 150ms) — each pilgrim row is a
      // static, already-rendered field set, so there's nothing to wait for
      // beyond giving the page's own listeners one paint cycle between rows.
      await nextFrame();
    }
    if (contact) await fillContact(contact);
    return { status: "success", filled: count };
  };

  // Fills the next still-empty pilgrim row with the next saved pilgrim who
  // isn't on the page yet, skipping anyone already there by name — however
  // they got there. Shared by the floating button and the panel's
  // "Fill next empty pilgrim" action so both behave identically.
  const fillNextPilgrim = async (pilgrims, contact) => {
    let nameInputs = Array.from(document.querySelectorAll('input[name="name"]'));
    if (!nameInputs.length) nameInputs = Array.from(document.querySelectorAll('input[name="fname"]'));
    if (!nameInputs.length) return { status: "error", message: "No pilgrim rows found on this page." };

    const onPage = new Set(nameInputs.map((el) => norm(el.value)).filter(Boolean));
    const next = (pilgrims || []).find((p) => p && p.name && !onPage.has(norm(p.name)));
    if (!next) return { status: "noop", message: "All saved pilgrims are already on this form." };

    const slot = nameInputs.findIndex((el) => !el.value || !el.value.trim());
    if (slot === -1) return { status: "noop", message: "Every pilgrim row on this page is already filled." };

    await fillPilgrim(next, slot, contact ? contact.country : undefined);
    if (contact) await fillContact(contact);
    return { status: "success", filled: 1, name: next.name, slot };
  };

  // ---- Undo the last fill and generalized Continue handling ----
  // First choice is an exact undo: put back whatever each field held before
  // the last fill overwrote it. If there's no usable log — the page re-rendered
  // and replaced those nodes, or the fill happened in an earlier page load —
  // fall back to emptying every text-ish field on the form, which is what
  // "clear the fields" is expected to do at that point.
  const clearFilled = async () => {
    let restored = 0;
    for (const [el, prev] of fillLog) {
      if (el && el.isConnected) {
        setControlledValue(el, prev);
        restored++;
      }
    }
    fillLog.clear();
    if (restored > 0) {
      clearQC();
      toast("↩ Restored " + restored + " field" + (restored === 1 ? "" : "s") + " to their previous values.", "success");
      return;
    }

    let cleared = 0;
    for (const el of collectFormFields()) {
      if (el.type === "file" || el.type === "checkbox" || el.type === "radio") continue;
      if (!el.value || !String(el.value).trim()) continue;
      setControlledValue(el, "");
      cleared++;
    }
    clearQC();
    if (cleared === 0) {
      toast("Nothing to clear — every field on this form is already empty.", "warn");
      return;
    }
    toast("🧹 Cleared " + cleared + " field" + (cleared === 1 ? "" : "s") + " on this form.", "success");
  };

  // A Continue/Next/Proceed button, by stable id or button text — but never a
  // pay / submit / book / confirm action.
  const CONTINUE_RE = /^(continue|next|proceed|save\s*&?\s*continue|save and continue)$/i;
  const findContinueButton = () => {
    const pasok = document.querySelector("#pasok");
    if (pasok && isVisible(pasok)) return pasok;
    const btns = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a[role="button"]'));
    return (
      btns.find((b) => {
        if (!isVisible(b) || b.disabled) return false;
        const txt = (b.innerText || b.value || "").trim();
        if (!CONTINUE_RE.test(txt)) return false;
        if (/pay|submit|book|confirm|delete|remove|cancel/i.test(txt)) return false;
        return true;
      }) || null
    );
  };
  const clickContinueGeneric = async () => {
    const btn = findContinueButton();
    if (!btn) {
      toast("No Continue button found on this step.", "warn");
      return false;
    }
    btn.click();
    await sleep(300);
    return true;
  };

  // ---- message handling: no license/paywall check, autofill runs immediately ----
  // Only this extension's own popup may drive a fill. Pages on the TTD site
  // cannot reach this listener (no `externally_connectable` is declared), but
  // the sender is checked anyway so a stray message can never move real data.
  const isOwnExtension = (sender) => !!sender && sender.id === chrome.runtime.id;

  // One fill at a time, whether triggered from the popup or the on-page button.
  const FILL_ACTIONS = new Set([
    "AUTOFILL", "FILL_SEVA", "FILL_ALL", "FILL_CONTACT", "FILL_SRIVANI", "FILL_NEXT", "CLEAR_FIELDS",
  ]);
  let globalFilling = false;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !isOwnExtension(sender)) return;

    if (FILL_ACTIONS.has(message.action)) {
      if (globalFilling) {
        sendResponse({ status: "error", message: "A fill is already running — please wait for it to finish." });
        return true;
      }
      globalFilling = true;
      // Same fresh undo log the floating button starts, so a fill driven from
      // the popup can be reverted by "Clear filled fields" as well. Clearing is
      // the one action that must NOT reset it — it's what it reads to undo.
      if (message.action !== "CLEAR_FIELDS") beginLog();
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
      const { pilgrim } = message.data;
      const contact = resolveEffectiveContact(message.data.contact, [pilgrim]);
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
          sendResponse({ status: "success", qc: runFieldQC() });
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
          sendResponse({ status: "success", qc: runFieldQC() });
        } catch (err) {
          sendResponse({ status: "error", message: err.message || err.toString() });
        }
      })();
      return true;
    }

    if (message.action === "FILL_ALL") {
      const { pilgrims, contact, thenContinue } = message.data;
      (async () => {
        try {
          const result = await fillAllPilgrims(pilgrims, contact);
          const qc = runFieldQC();
          if (thenContinue && result.status === "success") await clickContinueGeneric();
          sendResponse({ ...result, qc });
        } catch (err) {
          sendResponse({ status: "error", message: err.toString() });
        }
      })();
      return true;
    }

    if (message.action === "FILL_NEXT") {
      const { pilgrims, contact } = message.data;
      (async () => {
        try {
          const result = await fillNextPilgrim(pilgrims, resolveEffectiveContact(contact, pilgrims));
          if (result.status === "noop") {
            toast(result.message, "warn");
            sendResponse({ status: "success", filled: 0, message: result.message });
            return;
          }
          sendResponse({ ...result, qc: result.status === "success" ? runFieldQC() : undefined });
        } catch (err) {
          sendResponse({ status: "error", message: err.toString() });
        }
      })();
      return true;
    }

    if (message.action === "CLEAR_FIELDS") {
      (async () => {
        try {
          await clearFilled();
          sendResponse({ status: "success" });
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
          sendResponse({ status: "success", qc: runFieldQC() });
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
          sendResponse({ ...result, qc: runFieldQC() });
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
      const group = scope.querySelectorAll(`input[name="${name}"]`);
      group.forEach((el) => {
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

    // Wraps a fill action with the shared lock, the busy state, and (by default)
    // a fresh undo log so "Clear filled fields" can revert exactly this run.
    async function runGuarded(fn, { log = true, qc = log } = {}) {
      if (busy) return;
      if (globalFilling) {
        showToast("A fill is already running — please wait.", "warn");
        return;
      }
      setBusy(true);
      globalFilling = true;
      if (log) beginLog();
      try {
        await fn();
        if (qc) runFieldQC();
      } catch (err) {
        handleFillError(err);
      } finally {
        globalFilling = false;
        setBusy(false);
      }
    }

    async function runPilgrimFill(opts = {}) {
      const { overwrite = false, thenContinue = false } = opts;
      const stored = await loadSavedData();
      const pilgrims = stored.pilgrims || [];
      const contact = stored.contact || {};
      if (!pilgrims.length) {
        showToast("No pilgrims saved — open the extension to add them.", "warn");
        return;
      }
      const result = await fillAllPilgrims(pilgrims, contact, {
        overwrite,
        onProgress: (done, total) => setProgress(done + "/" + total + " pilgrims…"),
      });
      if (result.status !== "success") {
        showToast(result.message || "Could not fill this page.", "error");
        return;
      }
      showToast((overwrite ? "♻️ Re-filled " : "⚡ Filled ") + result.filled + " pilgrim" + (result.filled === 1 ? "" : "s") + ".", "success");
      if (thenContinue) await clickContinueGeneric();
      else scrollToFirstEmpty('input[name="name"], input[name="fname"]');
    }

    // Fills the next still-empty pilgrim row with the next saved pilgrim who
    // isn't on the page yet. It used to always reach for pilgrims[0], so
    // clicking it twice just refilled the same person into another row.
    async function runSinglePilgrim() {
      const stored = await loadSavedData();
      const pilgrims = stored.pilgrims || [];
      const contact = resolveEffectiveContact(stored.contact || {}, pilgrims);
      if (!pilgrims.length) {
        showToast("No pilgrims saved — open the extension to add them.", "warn");
        return;
      }
      const result = await fillNextPilgrim(pilgrims, contact);
      if (result.status === "error") {
        showToast(result.message, "error");
        return;
      }
      if (result.status === "noop") {
        showToast(result.message, "warn");
        return;
      }
      showToast("① Filled " + (result.name || "the next pilgrim") + " into row " + (result.slot + 1) + ".", "success");
    }

    async function runContactOnly() {
      const stored = await loadSavedData();
      await fillContact(resolveEffectiveContact(stored.contact || {}, stored.pilgrims || []));
      showToast("✉️ Contact details filled.", "success");
    }

    // Reads saved sets + the pilgrim vault directly (only possible when at-rest
    // encryption is off — those keys aren't handed to content scripts otherwise).
    async function readSetsAndVault() {
      const stored = await chrome.storage.local.get(["pilgrimSets", "pilgrimVault"]);
      if (isEncryptedValue(stored.pilgrimSets) || isEncryptedValue(stored.pilgrimVault)) return { locked: true };
      return {
        sets: Array.isArray(stored.pilgrimSets) ? stored.pilgrimSets : [],
        vault: Array.isArray(stored.pilgrimVault) ? stored.pilgrimVault : [],
      };
    }

    async function runFillFromSet(setId, overwrite) {
      const { sets, vault, locked } = await readSetsAndVault();
      if (locked) {
        showToast("🔒 Saved sets are locked — open the extension popup to use them.", "warn");
        return;
      }
      const set = (sets || []).find((s) => s.id === setId);
      if (!set) {
        showToast("That set no longer exists.", "warn");
        return;
      }
      const members = (set.pilgrimIds || [])
        .map((id) => (vault || []).find((v) => v.id === id))
        .filter(Boolean)
        .slice(0, 6);
      if (!members.length) {
        showToast("That set has no pilgrims.", "warn");
        return;
      }
      try {
        await chrome.storage.local.set({ lastUsedSet: setId });
      } catch {}
      const stored = await loadSavedData();
      const result = await fillAllPilgrims(members, stored.contact || {}, {
        overwrite: !!overwrite,
        onProgress: (done, total) => setProgress(done + "/" + total + " pilgrims…"),
      });
      showToast("Filled " + result.filled + " from “" + (set.name || "set") + "”.", "success");
    }

    async function runSrivaniFill(opts = {}) {
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
      if (opts.thenContinue) await clickContinueGeneric();
    }

    const sevakHasData = (m) => !!m && (m.sevakName || m.spvrName || m.mobileNo);
    // A group booking page shows more than one sevak block at once.
    const isGroupSevaPage = () => document.querySelectorAll('[class*="sevakContainer"]').length > 1;

    // Group members live in a separate array key, filled per-member by index.
    async function loadGroupMembers() {
      const stored = await chrome.storage.local.get(["groupSevaData"]);
      const raw = stored.groupSevaData;
      if (isEncryptedValue(raw)) return { locked: true, members: [] };
      const arr = Array.isArray(raw) ? raw : [];
      const members = [];
      arr.forEach((m, index) => {
        if (sevakHasData(m)) members.push({ member: m, index });
      });
      return { members };
    }

    // Fills one sevak; a numeric memberIndex targets the matching group block.
    async function fillSevaMember(data, memberIndex) {
      const payload = { ...data, clickSaveAndAdd: false };
      if (typeof memberIndex === "number") payload.memberIndex = memberIndex;
      await fillSevaForm(payload);
    }
    async function fillSevaMemberReport(member, index) {
      await fillSevaMember(member, index);
      showToast("🙏 Filled member " + (index + 1) + " — review, then Save & Add Sevak.", "success");
    }

    async function runSevaFill() {
      // On a group page, fill from the group array (per-member); otherwise the
      // single-sevak profile. The menu lets the user pick a specific member.
      if (isGroupSevaPage()) {
        const { members, locked } = await loadGroupMembers();
        if (locked) {
          showToast("🔒 Group Seva data is locked — open the extension popup to fill it.", "warn");
          return;
        }
        if (members.length) {
          await fillSevaMember(members[0].member, members[0].index);
          showToast("🙏 Filled member " + (members[0].index + 1) + " — use the ▾ menu to fill others.", "success");
          return;
        }
        // No group members saved — fall through to the single-sevak profile.
      }
      const { value, locked } = await loadPlainKey("sevakData");
      if (locked) {
        showToast("🔒 Seva data is locked — open the extension popup to fill it.", "warn");
        return;
      }
      if (!sevakHasData(value)) {
        showToast("No Sevak details saved — open the extension to add them.", "warn");
        return;
      }
      // One-click helper fills only; the user reviews and submits themselves.
      await fillSevaMember(value);
      showToast("🙏 Sevak details filled — review, then Save & Add Sevak.", "success");
    }

    // Default action: fill the detected form (pilgrims: only-empty unless overwrite).
    function onFillClick(opts = {}) {
      const type = detectFormType();
      if (!type) {
        showToast("Open a TTD booking form first.", "warn");
        return;
      }
      runGuarded(() => {
        if (type === "srivani") return runSrivaniFill();
        if (type === "seva") return runSevaFill();
        return runPilgrimFill({ overwrite: !!opts.overwrite });
      });
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
        #ttdfh-caret {
          position: absolute;
          top: -6px;
          right: -6px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,.55);
          background: #1E9E5C;
          color: #fff;
          font: 700 12px/1 system-ui, sans-serif;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          box-shadow: 0 2px 8px rgba(0,0,0,.35);
        }
        #ttdfh-caret:hover, #ttdfh-caret:focus-visible { transform: scale(1.1); outline: none; }
        #ttdfh-menu {
          position: absolute;
          right: 0;
          bottom: 68px;
          min-width: 210px;
          max-width: 280px;
          background: rgba(30, 20, 20, .98);
          border: 1px solid rgba(255,255,255,.10);
          border-radius: 12px;
          padding: 6px;
          box-shadow: 0 18px 50px rgba(0,0,0,.5);
          z-index: 2147483647;
        }
        #ttdfh-menu .ttdfh-menu-item {
          display: block;
          width: 100%;
          text-align: left;
          background: transparent;
          border: 0;
          border-radius: 8px;
          color: #fff;
          font: 600 12.5px/1.3 system-ui, -apple-system, sans-serif;
          padding: 9px 10px;
          cursor: pointer;
        }
        #ttdfh-menu .ttdfh-menu-item:hover, #ttdfh-menu .ttdfh-menu-item:focus-visible {
          background: rgba(255,255,255,.12);
          outline: none;
        }
        #ttdfh-menu .ttdfh-menu-sep {
          font: 700 10px/1.2 system-ui, sans-serif;
          text-transform: uppercase;
          letter-spacing: .05em;
          color: rgba(255,255,255,.5);
          padding: 8px 10px 4px;
          border-top: 1px solid rgba(255,255,255,.08);
          margin-top: 4px;
        }
        #ttdfh-menu .ttdfh-menu-sep:empty { padding: 0; margin: 4px 0; border-top: 1px solid rgba(255,255,255,.08); }
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

    // ---- Right-click / long-press / caret menu (keyboard-reachable) ----
    let menuOpen = false;
    function closeMenu() {
      const menu = document.getElementById("ttdfh-menu");
      if (menu) menu.hidden = true;
      menuOpen = false;
    }
    function menuItem(label, onClick) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ttdfh-menu-item";
      b.setAttribute("role", "menuitem");
      b.textContent = label;
      b.addEventListener("click", () => {
        closeMenu();
        onClick();
      });
      return b;
    }
    function menuSeparator(label) {
      const d = document.createElement("div");
      d.className = "ttdfh-menu-sep";
      if (label) d.textContent = label;
      return d;
    }
    async function openMenu() {
      const menu = document.getElementById("ttdfh-menu");
      if (!menu) return;
      menu.innerHTML = "";
      const type = detectFormType();
      if (type === "pilgrim") {
        menu.appendChild(menuItem("⚡ Fill all (empty rows)", () => onFillClick()));
        menu.appendChild(menuItem("♻️ Fill all (overwrite)", () => onFillClick({ overwrite: true })));
        menu.appendChild(menuItem("① Fill next empty pilgrim", () => runGuarded(runSinglePilgrim)));
        menu.appendChild(menuItem("✉️ Fill contact only", () => runGuarded(runContactOnly)));
        menu.appendChild(menuItem("⏭️ Fill all & Continue", () => runGuarded(() => runPilgrimFill({ thenContinue: true }))));
        const { sets, locked } = await readSetsAndVault();
        if (!locked && Array.isArray(sets) && sets.length) {
          let lastUsed = "";
          try {
            lastUsed = (await chrome.storage.local.get(["lastUsedSet"])).lastUsedSet || "";
          } catch {}
          menu.appendChild(menuSeparator("Saved sets"));
          sets.slice(0, 8).forEach((s) => {
            const star = s.id === lastUsed ? "★ " : "";
            menu.appendChild(menuItem(star + "👥 " + (s.name || "Unnamed set"), () => runGuarded(() => runFillFromSet(s.id, false))));
          });
        }
      } else if (type === "srivani") {
        menu.appendChild(menuItem("🪔 Fill Srivani", () => runGuarded(runSrivaniFill)));
        menu.appendChild(menuItem("⏭️ Fill Srivani & Continue", () => runGuarded(() => runSrivaniFill({ thenContinue: true }))));
      } else if (type === "seva") {
        if (isGroupSevaPage()) {
          const { members, locked } = await loadGroupMembers();
          if (locked) {
            menu.appendChild(menuItem("🔒 Group data locked — use the popup", () => {}));
          } else if (members.length) {
            menu.appendChild(menuSeparator("Group members"));
            members.forEach(({ member, index }) => {
              const nm = member.sevakName || member.spvrName || "Member " + (index + 1);
              menu.appendChild(menuItem("🙏 Fill member " + (index + 1) + " — " + nm, () => runGuarded(() => fillSevaMemberReport(member, index))));
            });
          } else {
            menu.appendChild(menuItem("No group members saved — use the popup", () => {}));
          }
        } else {
          menu.appendChild(menuItem("🙏 Fill Sevak", () => runGuarded(runSevaFill)));
        }
      } else {
        menu.appendChild(menuItem("Open a TTD booking form first", () => {}));
      }
      menu.appendChild(menuSeparator());
      menu.appendChild(menuItem("↩️ Undo / clear filled fields", () => runGuarded(clearFilled, { log: false })));
      menu.hidden = false;
      menuOpen = true;
      const first = menu.querySelector(".ttdfh-menu-item");
      if (first) first.focus();
    }
    function toggleMenu() {
      if (menuOpen) closeMenu();
      else openMenu();
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

      const menu = document.createElement("div");
      menu.id = "ttdfh-menu";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", "Fill options");
      menu.hidden = true;
      menu.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          closeMenu();
          const b = document.getElementById(BTN_ID);
          if (b) b.focus();
        }
      });
      wrap.appendChild(menu);

      const btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.type = "button";
      btn.setAttribute("aria-label", formLabel(type) + ". Shortcut: " + shortcutFull + ". Right-click or use the ▾ menu for more options.");
      btn.setAttribute("aria-haspopup", "menu");
      btn.innerHTML = '<span class="ttdfh-icon" aria-hidden="true">⚡</span><span class="ttdfh-kbd" aria-hidden="true">' + shortcutLabel + "</span>";
      btn.addEventListener("click", () => onFillClick());
      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openMenu();
      });
      // Long-press on touch devices opens the menu.
      let pressTimer = null;
      btn.addEventListener("touchstart", () => {
        pressTimer = setTimeout(() => {
          pressTimer = null;
          openMenu();
        }, 500);
      }, { passive: true });
      const cancelPress = () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };
      btn.addEventListener("touchend", cancelPress);
      btn.addEventListener("touchmove", cancelPress);
      wrap.appendChild(btn);

      const caret = document.createElement("button");
      caret.id = "ttdfh-caret";
      caret.type = "button";
      caret.setAttribute("aria-label", "More fill options");
      caret.setAttribute("aria-haspopup", "menu");
      caret.textContent = "▾";
      caret.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleMenu();
      });
      wrap.appendChild(caret);

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
      // Alt+A = normal fill (empty rows); Alt+Shift+A = overwrite existing values.
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyA") {
        if (!hasBookingForm()) return;
        e.preventDefault();
        onFillClick({ overwrite: e.shiftKey });
      }
    });

    // Close the options menu when clicking away from the button.
    document.addEventListener("click", (e) => {
      if (!menuOpen) return;
      const wrap = document.getElementById("ttdfh-fab-wrap");
      if (wrap && !wrap.contains(e.target)) closeMenu();
    });

    // Selector-health check: if this looks like a booking page but no known form
    // is found once the SPA settles, hint the user (non-blocking) — once per page.
    let healthChecked = false;
    function looksLikeBookingUrl() {
      const p = (location.pathname + location.search).toLowerCase();
      return /book|darshan|seva|srivani|pilgrim|sevak|arjitha|homam/.test(p);
    }
    function selectorHealthCheck() {
      if (healthChecked || !looksLikeBookingUrl() || detectFormType()) return;
      healthChecked = true;
      setTimeout(() => {
        if (!detectFormType() && looksLikeBookingUrl()) {
          toast("Page layout may have changed — open the extension popup to fill.", "warn");
        }
      }, 4000);
    }

    function boot() {
      sync();
      selectorHealthCheck();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();

    let debounceTimer;
    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(sync, 600);
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  })();
})();
