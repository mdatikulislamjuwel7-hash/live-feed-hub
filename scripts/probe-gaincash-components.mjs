import * as cheerio from "cheerio";

function decodeAttr(value = "") {
  return String(value).replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

async function probe(url, componentMatch) {
  const origin = new URL(url).origin;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const cookie = (res.headers.getSetCookie?.() || [])
    .map((c) => c.split(";")[0])
    .join("; ");
  const $ = cheerio.load(html);
  const csrf = $('meta[name="csrf-token"]').attr("content") || "";
  const el = $("[wire\\:snapshot]")
    .toArray()
    .find((e) =>
      decodeAttr($(e).attr("wire:snapshot") || "").includes(componentMatch)
    );
  if (!el) {
    console.log(componentMatch, "NOT FOUND");
    return;
  }
  let snapshot = decodeAttr($(el).attr("wire:snapshot") || "");
  const lazy = decodeAttr($(el).attr("x-intersect") || "").match(
    /__lazyLoad\('([^']+)/
  )?.[1];
  const xsrf = cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1];
  const token = xsrf ? decodeURIComponent(xsrf) : csrf;

  async function update(calls) {
    const lw = await fetch(`${origin}/livewire/update`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-TOKEN": csrf,
        "X-XSRF-TOKEN": token,
        Cookie: cookie,
        Origin: origin,
        Referer: url,
      },
      body: JSON.stringify({
        _token: csrf,
        components: [{ snapshot, updates: {}, calls }],
      }),
    });
    const json = await lw.json();
    snapshot = json?.components?.[0]?.snapshot || snapshot;
    return json?.components?.[0]?.effects?.html || "";
  }

  if (lazy) await update([{ path: "", method: "__lazyLoad", params: [lazy] }]);
  const out = await update([]);
  console.log("\n===", componentMatch, "html", out.length);
  console.log(out.replace(/\s+/g, " ").slice(0, 500));
  try {
    const snap = JSON.parse(decodeAttr(snapshot));
    console.log("data keys", Object.keys(snap.data || {}));
  } catch {}
}

await probe("https://gaincash.me/earn", "user.recent-completed-offers");
await probe("https://gaincash.me/earn", "user.live-cashouts");
