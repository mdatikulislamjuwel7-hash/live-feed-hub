/**
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchGraphqlFeed(source) {
  const res = await fetch(String(source.url), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: String(source.origin || new URL(String(source.url)).origin),
      Referer: String(source.referer || new URL(String(source.url)).origin),
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LiveFeedHub/1.0",
    },
    body: JSON.stringify({ query: String(source.query || "") }),
    signal: AbortSignal.timeout(Number(source.timeoutMs) || 25000),
  });

  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) {
    throw new Error(`${source.name}: ${data.errors[0]?.message || "GraphQL error"}`);
  }

  if (source.schema !== "lootgain") {
    throw new Error(`${source.name}: unknown graphql-feed schema`);
  }

  const rows = Array.isArray(data?.data?.getLiveRewards)
    ? data.data.getLiveRewards
    : [];

  return rows.slice(0, Number(source.limit) || 30).map((row) => {
    const amount = Number(row.amount || 0);
    return {
      id: `${source.id}-${row.id}`,
      source: String(source.id),
      sourceName: String(source.name),
      user: String(row.user || "anonymous"),
      offer: String(row.name || "Reward"),
      offerwall: String(row.name || "Reward"),
      offerName: "Live reward",
      country: null,
      isPrivate: false,
      amount,
      unit: "loots",
      rawAmount: `${amount.toLocaleString()} loots`,
      at: new Date().toISOString(),
    };
  });
}
