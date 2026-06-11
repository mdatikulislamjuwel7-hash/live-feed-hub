import * as cheerio from "cheerio";
import { writeFileSync } from "fs";

function decodeAttr(value = "") {
  return String(value).replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

const url = "https://gaincash.me/earn";
const origin = "https://gaincash.me";
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
    decodeAttr($(e).attr("wire:snapshot") || "").includes("user.live-cashouts")
  );
let snapshot = decodeAttr($(el).attr("wire:snapshot") || "");
const lazy = decodeAttr($(el).attr("x-intersect") || "").match(
  /__lazyLoad\('([^']+)/
)?.[1];
const xsrf = cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1];
const token = xsrf ? decodeURIComponent(xsrf) : csrf;
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
    components: [
      {
        snapshot,
        updates: {},
        calls: [{ path: "", method: "__lazyLoad", params: [lazy] }],
      },
    ],
  }),
});
const json = await lw.json();
const out = json?.components?.[0]?.effects?.html || "";
writeFileSync("tmp-gaincash-lw.html", out);
const $2 = cheerio.load(out);
$2(".fade-in-scale, .cashout_item, .swiper-slide").each((i, el) => {
  if (i >= 5) return false;
  console.log("---", $2(el).attr("class"));
  console.log($2(el).text().replace(/\s+/g, " ").slice(0, 200));
  console.log("title", $2(el).attr("title")?.slice(0, 150));
});
