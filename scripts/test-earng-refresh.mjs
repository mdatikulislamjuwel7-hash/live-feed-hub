import * as cheerio from "cheerio";

function decodeAttr(value = "") {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

async function livewireCall(source, componentMatch, method) {
  const url = String(source.url);
  const origin = new URL(url).origin;
  const res = await fetch(url, {
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 Chrome/120" },
  });
  const html = await res.text();
  const cookie = (res.headers.getSetCookie?.() || [])
    .map((c) => c.split(";")[0])
    .join("; ");
  const $ = cheerio.load(html);
  const csrf = $('meta[name="csrf-token"]').attr("content") || "";
  const el = $("[wire\\:snapshot]")
    .toArray()
    .find((e) => decodeAttr($(e).attr("wire:snapshot") || "").includes(componentMatch));
  if (!el) throw new Error("component not found");

  let snapshot = decodeAttr($(el).attr("wire:snapshot") || "");
  const lazyPayload = decodeAttr($(el).attr("x-intersect") || "").match(
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
        "User-Agent": "Mozilla/5.0 Chrome/120",
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

  if (lazyPayload) {
    await update([{ path: "", method: "__lazyLoad", params: [lazyPayload] }]);
  }
  const htmlOut = await update([{ path: "", method, params: [] }]);
  console.log(method, "html len", htmlOut.length);
  console.log(htmlOut.replace(/\s+/g, " ").slice(0, 600));
  const snap = JSON.parse(decodeAttr(snapshot));
  console.log("liveLeads count", snap?.data?.liveLeads?.[0]?.length ?? snap?.data?.liveLeads);
}

await livewireCall({ url: "https://earng.net/earn" }, "user.widget.live-lead", "refreshLiveLeAD");
