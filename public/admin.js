const form = document.getElementById("offerForm");
const offersList = document.getElementById("offersList");
const adminStatus = document.getElementById("adminStatus");
const refreshOffers = document.getElementById("refreshOffers");
const resetForm = document.getElementById("resetForm");

const fields = {
  id: document.getElementById("offerId"),
  name: document.getElementById("offerName"),
  offerwall: document.getElementById("offerwall"),
  reward: document.getElementById("reward"),
  unit: document.getElementById("unit"),
  country: document.getElementById("country"),
  targetUrl: document.getElementById("targetUrl"),
  postbackSecret: document.getElementById("postbackSecret"),
  externalPostbackUrl: document.getElementById("externalPostbackUrl"),
  active: document.getElementById("active"),
};

function escapeHtml(value) {
  const d = document.createElement("div");
  d.textContent = String(value ?? "");
  return d.innerHTML;
}

function setStatus(message, isError = false) {
  adminStatus.textContent = message;
  adminStatus.className = `admin-status ${isError ? "err" : "ok"}`;
}

function resetOfferForm() {
  form.reset();
  fields.id.value = "";
  fields.unit.value = "coins";
  fields.active.checked = true;
}

function formPayload() {
  return {
    id: fields.id.value.trim(),
    name: fields.name.value.trim(),
    offerwall: fields.offerwall.value.trim(),
    reward: Number(fields.reward.value || 0),
    unit: fields.unit.value.trim() || "coins",
    country: fields.country.value.trim(),
    targetUrl: fields.targetUrl.value.trim(),
    postbackSecret: fields.postbackSecret.value.trim(),
    externalPostbackUrl: fields.externalPostbackUrl.value.trim(),
    active: fields.active.checked,
  };
}

function fillForm(offer) {
  fields.id.value = offer.id || "";
  fields.name.value = offer.name || "";
  fields.offerwall.value = offer.offerwall || "";
  fields.reward.value = offer.reward ?? "";
  fields.unit.value = offer.unit || "coins";
  fields.country.value = offer.country || "";
  fields.targetUrl.value = offer.targetUrl || "";
  fields.postbackSecret.value = offer.postbackSecret || "";
  fields.externalPostbackUrl.value = offer.externalPostbackUrl || "";
  fields.active.checked = offer.active !== false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
  setStatus("Copied");
}

function renderOffers(offers) {
  if (!offers.length) {
    offersList.innerHTML = '<p class="empty">No custom offers yet.</p>';
    return;
  }

  offersList.innerHTML = offers
    .map(
      (offer) => `
      <article class="admin-offer-card" data-id="${escapeHtml(offer.id)}">
        <div class="admin-offer-top">
          <div>
            <h3>${escapeHtml(offer.name)}</h3>
            <p>${escapeHtml(offer.offerwall)} · ${escapeHtml(offer.reward)} ${escapeHtml(offer.unit)}${offer.country ? ` · ${escapeHtml(offer.country)}` : ""}</p>
          </div>
          <span class="offer-state ${offer.active ? "active" : "inactive"}">${offer.active ? "Active" : "Inactive"}</span>
        </div>
        <label>
          Click URL
          <textarea readonly>${escapeHtml(offer.clickUrl || "")}</textarea>
        </label>
        <label>
          Postback URL
          <textarea readonly>${escapeHtml(offer.postbackUrl || "")}</textarea>
        </label>
        <div class="admin-actions">
          <button type="button" data-action="edit">Edit</button>
          <button type="button" data-action="copy-click" class="secondary">Copy click</button>
          <button type="button" data-action="copy-postback" class="secondary">Copy postback</button>
          <button type="button" data-action="delete" class="danger-btn">Delete</button>
        </div>
      </article>`
    )
    .join("");

  offersList.querySelectorAll(".admin-offer-card").forEach((card) => {
    const id = card.getAttribute("data-id");
    const offer = offers.find((item) => item.id === id);
    card.addEventListener("click", async (event) => {
      const btn = event.target.closest("button");
      if (!btn || !offer) return;
      const action = btn.getAttribute("data-action");
      if (action === "edit") fillForm(offer);
      if (action === "copy-click") await copyText(offer.clickUrl || "");
      if (action === "copy-postback") await copyText(offer.postbackUrl || "");
      if (action === "delete") {
        if (!confirm(`Delete ${offer.name}?`)) return;
        await fetch(`/api/admin/offers/${encodeURIComponent(offer.id)}`, {
          method: "DELETE",
        });
        setStatus("Deleted");
        await loadOffers();
      }
    });
  });
}

async function loadOffers() {
  const res = await fetch("/api/admin/offers");
  const data = await res.json();
  renderOffers(data.offers || []);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const res = await fetch("/api/admin/offers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formPayload()),
  });
  if (!res.ok) {
    setStatus("Save failed", true);
    return;
  }
  const data = await res.json();
  fillForm(data.offer);
  setStatus("Saved");
  await loadOffers();
});

refreshOffers.addEventListener("click", loadOffers);
resetForm.addEventListener("click", resetOfferForm);

loadOffers().catch(() => setStatus("Failed to load offers", true));
