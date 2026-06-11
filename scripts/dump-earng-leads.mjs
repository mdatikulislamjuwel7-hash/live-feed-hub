import * as cheerio from "cheerio";

function decodeAttr(value = "") {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

const url = "https://earng.net/earn";
const origin = "https://earng.net";
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
    decodeAttr($(e).attr("wire:snapshot") || "").includes("user.widget.live-lead")
  );
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
    },
    body: JSON.stringify({
      _token: csrf,
      components: [{ snapshot, updates: {}, calls }],
    }),
  });
  const json = await lw.json();
  snapshot = json?.components?.[0]?.snapshot || snapshot;
  return json;
}

await update([{ path: "", method: "__lazyLoad", params: [lazyPayload] }]);
const out = await update([{ path: "", method: "refreshLiveLeAD", params: [] }]);
const snap = JSON.parse(decodeAttr(snapshot));
const leads = snap.data.liveLeads[0];
console.log(JSON.stringify(leads[0], null, 2));
console.log("total", leads.length);
