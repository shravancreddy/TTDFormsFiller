// Small DOM helpers that turn validation results into visible feedback.
import { t } from "./i18n.js";
import { issueBadge } from "./validation.js";

/** Clears any previously painted validation state from a form. */
export function clearValidation(formEl) {
  formEl.querySelectorAll(".field-error, .field-warning").forEach((el) => el.remove());
  formEl.querySelectorAll(".invalid, .warned").forEach((el) => el.classList.remove("invalid", "warned"));
}

/**
 * Paints inline messages under each offending field.
 * `fields` is the map returned by validatePilgrim/validateSevak/etc.
 */
export function paintValidation(formEl, fields, { onlyTouched = null } = {}) {
  clearValidation(formEl);
  for (const [name, result] of Object.entries(fields || {})) {
    if (!result || !result.message) continue;
    if (onlyTouched && !onlyTouched.has(name)) continue;

    const input = formEl.elements ? formEl.elements[name] : null;
    const isError = !result.ok && result.severity === "error";
    const holder = input ? input.closest(".form-group") || input.parentElement : null;
    if (input) input.classList.add(isError ? "invalid" : "warned");
    if (!holder) continue;

    const msg = document.createElement("div");
    msg.className = isError ? "field-error" : "field-warning";
    msg.textContent = (isError ? "⛔ " : "⚠ ") + result.message;
    holder.appendChild(msg);
  }
}

/** A block listing every problem, shown above a Fill button. */
export function buildIssueList(result, { title } = {}) {
  const problems = result.errors.length > 0 ? result.errors : result.warnings;
  if (problems.length === 0) return null;

  const box = document.createElement("div");
  box.className = "issue-list" + (result.errors.length === 0 ? " warning-tone" : "");

  const heading = document.createElement("strong");
  heading.textContent = title || (result.errors.length > 0 ? t("validation_fix_before_fill") : t("validation_check_before_fill"));
  box.appendChild(heading);

  const ul = document.createElement("ul");
  problems.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = p.message;
    ul.appendChild(li);
  });
  box.appendChild(ul);
  return box;
}

/** Small coloured pill for list rows: "Ready" / "2 issues" / "1 note". */
export function buildBadge(result) {
  const badge = issueBadge(result);
  if (!badge) return null;
  const el = document.createElement("span");
  el.className = "record-badge " + badge.kind;
  el.textContent = badge.kind === "ok" ? t("validation_ready") : badge.text;
  if (badge.kind !== "ok") {
    const problems = result.errors.length > 0 ? result.errors : result.warnings;
    el.title = problems.map((p) => p.message).join("\n");
  }
  return el;
}

/**
 * Re-validates a form as the user types, but only surfaces a message for
 * fields they've already interacted with — so a fresh empty form isn't a
 * wall of red before they've typed anything.
 */
export function liveValidate(formEl, validateFn) {
  const touched = new Set();
  const run = () => {
    const data = Object.fromEntries(new FormData(formEl).entries());
    const result = validateFn(data);
    paintValidation(formEl, result.fields, { onlyTouched: touched });
    return result;
  };
  formEl.addEventListener(
    "blur",
    (e) => {
      if (e.target && e.target.name) {
        touched.add(e.target.name);
        run();
      }
    },
    true
  );
  formEl.addEventListener("input", (e) => {
    if (e.target && e.target.name && touched.has(e.target.name)) run();
  });
  formEl.addEventListener("change", (e) => {
    if (e.target && e.target.name) {
      touched.add(e.target.name);
      run();
    }
  });
  return {
    run,
    /** Marks every field touched and paints everything — used on submit. */
    revealAll() {
      const data = Object.fromEntries(new FormData(formEl).entries());
      const result = validateFn(data);
      Object.keys(result.fields).forEach((f) => touched.add(f));
      paintValidation(formEl, result.fields);
      return result;
    },
  };
}
