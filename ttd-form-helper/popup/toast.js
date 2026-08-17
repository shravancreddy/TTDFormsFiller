const root = () => document.getElementById("toast-root");

export function showMessage(message, kind = "info") {
  const container = root();
  if (!container || !message) return;
  const el = document.createElement("div");
  el.className = "toast" + (kind !== "info" ? " " + kind : "");
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
