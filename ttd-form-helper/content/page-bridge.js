// TTD Form Helper — page bridge. Runs in the page's own (MAIN) world.
//
// Since October 2026 TTD's shared text field drops every event the browser did
// not generate itself: its onChange, the dropdown opener's onClick, each option's
// onClick and the multi-select checkboxes all start with
// `if (!event.nativeEvent.isTrusted) return` (the text field also writes React's
// value back into the input). Events dispatched by a content script are never
// trusted, so every fill came back empty and Continue reported the fields blank.
//
// The content script lives in an isolated world and cannot reach React's
// handlers; this file can. autofill.js sets the value on the input as before
// and then dispatches `ttdfh:page-op` on the element; this calls that element's
// own React onChange / onClick with the real element as the target, which is
// exactly what the field would receive from a person typing or clicking. The
// answer goes back on the element as data-ttdfh-op="ok" | "no", read
// synchronously by the caller. Nothing else is exposed to the page.
(function () {
  if (window.__ttdfhPageBridge) return;
  Object.defineProperty(window, "__ttdfhPageBridge", { value: true });

  const propsOf = (el) => {
    const key = el && Object.keys(el).find((k) => k.startsWith("__reactProps$"));
    return key ? el[key] : null;
  };

  const syntheticEvent = (el, type) => {
    let prevented = false;
    let stopped = false;
    return {
      type,
      target: el,
      currentTarget: el,
      bubbles: true,
      nativeEvent: { isTrusted: true, type, target: el },
      preventDefault() { prevented = true; },
      isDefaultPrevented() { return prevented; },
      stopPropagation() { stopped = true; },
      isPropagationStopped() { return stopped; },
      persist() {},
    };
  };

  const writeValue = (el, value) => {
    const proto = Object.getPrototypeOf(el);
    const desc = proto && Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
  };

  const run = (el, op, value) => {
    if (op === "change") {
      // A read-only combobox takes its value from the option click, not from here.
      const props = propsOf(el);
      if (el.readOnly || !props || typeof props.onChange !== "function") return false;
      writeValue(el, value == null ? "" : String(value));
      props.onChange(syntheticEvent(el, "change"));
      return true;
    }
    if (op === "click") {
      // Like a real click: the nearest onClick from the element up.
      for (let node = el, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
        const props = propsOf(node);
        if (props && typeof props.onClick === "function") {
          props.onClick(syntheticEvent(el, "click"));
          return true;
        }
      }
      // A checkbox / radio only has onChange.
      const props = propsOf(el);
      if ((el.type === "checkbox" || el.type === "radio") && props && typeof props.onChange === "function") {
        el.checked = el.type === "radio" ? true : !el.checked;
        props.onChange(syntheticEvent(el, "change"));
        return true;
      }
      return false;
    }
    return false;
  };

  document.addEventListener(
    "ttdfh:page-op",
    (ev) => {
      const el = ev.target;
      if (!(el instanceof Element)) return;
      let ok = false;
      try {
        const req = JSON.parse(ev.detail);
        ok = run(el, req.op, req.value);
      } catch {
        ok = false;
      }
      el.setAttribute("data-ttdfh-op", ok ? "ok" : "no");
    },
    true
  );
})();
