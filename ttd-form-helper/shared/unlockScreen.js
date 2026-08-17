// Shown in place of the normal UI when at-rest encryption is on and the
// vault hasn't been unlocked yet this browser session.
import { unlockVault } from "./secureStore.js";
import { t } from "./i18n.js";

export function renderUnlockScreen(container, { onUnlocked }) {
  container.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "lock-screen";

  const icon = document.createElement("div");
  icon.className = "lock-icon";
  icon.textContent = "🔒";

  const title = document.createElement("h2");
  title.className = "lock-title";
  title.textContent = t("lock_title");

  const body = document.createElement("p");
  body.className = "lock-body";
  body.textContent = t("lock_body");

  const form = document.createElement("form");
  form.className = "lock-form";

  const input = document.createElement("input");
  input.type = "password";
  input.className = "lock-input";
  input.placeholder = t("lock_passphrase_placeholder");
  input.autocomplete = "current-password";
  input.required = true;

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "btn-primary";
  submit.textContent = t("lock_unlock");

  const error = document.createElement("div");
  error.className = "lock-error";
  error.hidden = true;

  form.appendChild(input);
  form.appendChild(submit);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;
    submit.textContent = t("lock_unlocking");
    error.hidden = true;
    const ok = await unlockVault(input.value);
    submit.disabled = false;
    submit.textContent = t("lock_unlock");
    if (!ok) {
      error.textContent = t("lock_wrong_passphrase");
      error.hidden = false;
      input.select();
      return;
    }
    onUnlocked();
  });

  const note = document.createElement("p");
  note.className = "lock-note";
  note.textContent = t("lock_note");

  wrap.appendChild(icon);
  wrap.appendChild(title);
  wrap.appendChild(body);
  wrap.appendChild(form);
  wrap.appendChild(error);
  wrap.appendChild(note);
  container.appendChild(wrap);

  setTimeout(() => input.focus(), 50);
}
