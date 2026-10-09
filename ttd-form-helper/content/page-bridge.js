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
// handlers; this file can. autofill.js dispatches `ttdfh:page-op` on the
// element, and this replays the action through React's own event system: it
// briefly wraps that one handler on the element's React props so it sees
// `nativeEvent.isTrusted === true`, then fires a plain input / click event.
// Going through React (rather than calling the handler directly) matters:
// React treats it like a keystroke and commits the update before returning.
// Many TTD handlers save a copy of the form from the last render
// (`{ ...state, [name]: value }`) and their onBlur checks read that copy, so an
// update left pending would be wiped by the next write or flagged "This field
// is required". If React does not route the event to the handler (a disabled
// field, an unchanged value), the handler is called directly instead. The
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

  // A view of the real event that reports isTrusted; everything else (methods
  // included) still goes to the real event.
  const trusted = (ev) => {
    const native = ev && ev.nativeEvent;
    if (!native) return ev;
    const view = new Proxy(native, {
      get(t, k) {
        if (k === "isTrusted") return true;
        const v = Reflect.get(t, k);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    try {
      Object.defineProperty(ev, "nativeEvent", { value: view, configurable: true, writable: true });
    } catch {}
    return ev;
  };

  // Wraps props[key] for the duration of fire(); true if React called it.
  const viaReact = (props, key, fire) => {
    const original = props[key];
    let called = false;
    try {
      props[key] = function (ev) {
        called = true;
        return original.call(this, trusted(ev));
      };
      fire();
    } catch {
      // fall through to the direct call
    } finally {
      props[key] = original;
    }
    return called;
  };

  const run = (el, op, value) => {
    if (op === "change") {
      // A read-only combobox takes its value from the option click, not from here.
      const props = propsOf(el);
      if (el.readOnly || !props || typeof props.onChange !== "function") return false;
      // The prototype setter skips React's value tracker, so React sees a change.
      writeValue(el, value == null ? "" : String(value));
      if (!viaReact(props, "onChange", () => el.dispatchEvent(new Event("input", { bubbles: true })))) {
        props.onChange(syntheticEvent(el, "change"));
      }
      return true;
    }
    if (op === "click") {
      // Like a real click: the nearest onClick from the element up.
      for (let node = el, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
        const props = propsOf(node);
        if (props && typeof props.onClick === "function") {
          if (!viaReact(props, "onClick", () => el.click())) props.onClick(syntheticEvent(el, "click"));
          return true;
        }
      }
      // A checkbox / radio only has onChange, which React fires on click.
      const props = propsOf(el);
      if ((el.type === "checkbox" || el.type === "radio") && props && typeof props.onChange === "function") {
        if (!viaReact(props, "onChange", () => el.click())) {
          el.checked = el.type === "radio" ? true : !el.checked;
          props.onChange(syntheticEvent(el, "change"));
        }
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
