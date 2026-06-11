import { writeFileSync } from "fs";
import * as cheerio from "cheerio";

function decodeAttr(value = "") {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

const url = "https://earng.net/earn";
const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
const html = await res.text();
const cookie = (res.headers.getSetCookie?.() || [])
  .map((c) => c.split(";")[0])
  .join("; ");
const $ = cheerio.load(html);
const csrf = $('meta[name="csrf-token"]').attr("content") || "";
const el = $("[wire\\:snapshot]")
  .toArray()
  .find((e) => decodeAttr($(e).attr("wire:snapshot") || "").includes("user.widget.live-lead"));
const snapshot = decodeAttr($(el).attr("wire:snapshot") || "");
const lazy = decodeAttr($(el).attr("x-intersect") || "").match(/__lazyLoad\('([^']+)/)?.[1];
const xsrf = cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1];
const token = xsrf ? decodeURIComponent(xsrf) : csrf;
const lw = await fetch("https://earng.net/livewire/update", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-CSRF-TOKEN": csrf,
    "X-XSRF-TOKEN": token,
    Cookie: cookie,
    Origin: "https://earng.net",
    Referer: url,
  },
  body: JSON.stringify({
    _token: csrf,
    components: [
      {
        snapshot,
        updates: {},
        calls: [{ path: "", method: "__lazyLoad", params: [lazy] }],
      },
    ],
  }),
});
const out = await lw.json();
const h = out?.components?.[0]?.effects?.html || "";
writeFileSync("tmp-earng-lw.html", h);
const $2 = cheerio.load(h);
console.log($2.root().text().replace(/\s+/g, " ").slice(0, 800));
console.log("---items---");
$2("div").each((_, d) => {
  const t = $2(d).text().replace(/\s+/g, " ").trim();
  if (t.length > 20 && t.length < 200 && /\d/.test(t)) console.log($2(d).attr("class"), "|", t.slice(0, 150));
});
