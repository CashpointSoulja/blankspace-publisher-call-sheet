// Fills [data-claims="id,id"] with blankspace's own claims, only once they carry a source.
// Until then the container keeps its fallback text.

import { clear, loadSourcedClaims, claimNode } from "./common.js";

const slots = document.querySelectorAll("[data-claims]");
if (slots.length) {
  loadSourcedClaims().then((claims) => {
    for (const slot of slots) {
      const ids = slot.dataset.claims.split(",").map((s) => s.trim());
      const found = ids.map((id) => claims.find((c) => c.id === id)).filter(Boolean);
      if (!found.length) continue;
      clear(slot);
      for (const c of found) slot.append(claimNode(c));
      slot.hidden = false;
      const fallback = slot.parentElement && slot.parentElement.querySelector("[data-claims-fallback]");
      if (fallback) fallback.hidden = true;
    }
  }).catch(() => { /* fallback text stays */ });
}
