import crypto from "crypto";

/**
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchTickerApi(source) {
  const res = await fetch(source.url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "LiveFeedHub/1.0 (+aggregator)",
    },
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) {
    throw new Error(`${source.name}: HTTP ${res.status}`);
  }

  const text = await res.text();
  if (!text.trim().startsWith("[")) {
    throw new Error(`${source.name}: not JSON array`);
  }

  /** @type {Array<Record<string, unknown>>} */
  const rows = JSON.parse(text);
  const events = [];

  for (const row of rows.slice(0, 40)) {
    const operation = String(row.operation ?? "");
    if (operation === "debit") continue;

    const panelist = /** @type {Record<string, unknown>} */ (row.panelist ?? {});
    const username = String(panelist.username ?? "anonymous");
    const description = String(row.description ?? "Offer");
    const merchant = String(row.merchant ?? "");
    const value = parseFloat(String(row.value ?? "0"));
    const date = String(row.date ?? new Date().toISOString());

    const offerwall = merchant || "Offer";
    const offerName = description;
    const offer = merchant ? `${merchant} → ${description}` : description;
    const id = crypto
      .createHash("sha256")
      .update(`${source.id}|${username}|${offer}|${value}|${date}`)
      .digest("hex")
      .slice(0, 24);

    const country = String(panelist.country ?? "");

    events.push({
      id: `${source.id}-${id}`,
      source: source.id,
      sourceName: source.name,
      user: username,
      offer: offer.length > 100 ? `${offer.slice(0, 97)}...` : offer,
      offerwall,
      offerName,
      country: country || null,
      isPrivate: false,
      amount: value,
      unit: "USD",
      rawAmount: `$${value.toFixed(2)}`,
      at: date,
    });
  }

  return events;
}
