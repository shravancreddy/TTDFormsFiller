// Shared "Add from Saved Pilgrims" collapsible picker, used by the Pilgrim
// Booking and Srivani tabs to pull entries out of the persistent vault.
import { STORAGE_KEYS } from "../../shared/storage.js";
import { secureGet as storageGet } from "../../shared/secureStore.js";
import { t } from "../../shared/i18n.js";

export function createVaultPicker({ isAdded, onAdd, isDisabled }) {
  const wrap = document.createElement("div");
  wrap.className = "vault-picker";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "vault-toggle";

  const list = document.createElement("div");
  list.className = "vault-list";
  list.hidden = true;

  let expanded = false;
  let vault = [];

  async function refreshCount() {
    vault = (await storageGet([STORAGE_KEYS.vault]))[STORAGE_KEYS.vault] || [];
    toggle.innerHTML = `<span>${t("vault_add_from", { count: vault.length })}</span><span>${expanded ? "▲" : "▼"}</span>`;
  }

  function renderList() {
    list.innerHTML = "";
    if (vault.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = t("vault_empty");
      list.appendChild(empty);
      return;
    }
    for (const entry of vault) {
      const row = document.createElement("div");
      row.className = "vault-row";

      const info = document.createElement("div");
      const name = document.createElement("div");
      name.className = "vault-row-name";
      name.textContent = entry.name || t("vault_unnamed");
      const meta = document.createElement("div");
      meta.className = "vault-row-meta";
      const bits = [entry.age ? `${entry.age} ${t("unit_years")}` : "", entry.gender || "", entry.idProof || ""].filter(Boolean);
      meta.textContent = bits.join(" • ") || t("vault_details_incomplete");
      info.appendChild(name);
      info.appendChild(meta);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vault-add-btn";
      const added = isAdded(entry);
      const disabled = !added && isDisabled && isDisabled();
      btn.disabled = added || !!disabled;
      btn.classList.toggle("added", added);
      btn.title = added ? t("vault_title_added") : disabled ? t("vault_title_full") : t("vault_title_add");
      btn.textContent = added ? t("vault_added") : t("vault_add");
      btn.addEventListener("click", async () => {
        await onAdd(entry);
        await refreshCount();
        renderList();
      });

      row.appendChild(info);
      row.appendChild(btn);
      list.appendChild(row);
    }
  }

  toggle.addEventListener("click", async () => {
    expanded = !expanded;
    list.hidden = !expanded;
    if (expanded) {
      await refreshCount();
      renderList();
    } else {
      await refreshCount();
    }
  });

  refreshCount();
  wrap.appendChild(toggle);
  wrap.appendChild(list);

  return {
    el: wrap,
    async refresh() {
      await refreshCount();
      if (expanded) renderList();
    },
  };
}
