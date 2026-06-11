import { fetchLaravelLiveFeed } from "../src/adapters/laravel-live-feed.js";
import * as cheerio from "cheerio";

function decodeAttr(value = "") {
  return String(value).replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

// debug earng snapshot
const url = "https://earng.net/earn";
const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
const html = await res.text();
const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
const $ = cheerio.load(html);
const el = $("[wire\\:snapshot]").toArray().find((e) =>
  decodeAttr($(e).attr("wire:snapshot") || "").includes("user.widget.live-lead")
);
console.log("found el", !!el);

const events = await fetchLaravelLiveFeed({
  id: "earng",
  name: "EarnG",
  laravelMode: "live-leads",
  url,
  livewireComponent: "user.widget.live-lead",
  refreshMethod: "refreshLiveLeAD",
});
console.log(events[0]);

// debug gaincash title
const res2 = await fetch("https://gaincash.me/earn", { headers: { "User-Agent": "Mozilla/5.0" } });
const html2 = await res2.text();
const cookie2 = (res2.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
const $2 = cheerio.load(html2);
const csrf = $2('meta[name="csrf-token"]').attr("content") || "";
const comp = $2("[wire\\:snapshot]").toArray().find((e) =>
  decodeAttr($2(e).attr("wire:snapshot") || "").includes("user.live-cashouts")
);
let snapshot = decodeAttr($2(comp).attr("wire:snapshot") || "");
const lazy = decodeAttr($2(comp).attr("x-intersect") || "").match(/__lazyLoad\('([^']+)/)?.[1];
const xsrf = cookie2.match(/XSRF-TOKEN=([^;]+)/)?.[1];
const token = xsrf ? decodeURIComponent(xsrf) : csrf;
const lw = await fetch("https://gaincash.me/livewire/update", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-CSRF-TOKEN": csrf,
    "X-XSRF-TOKEN": token,
    Cookie: cookie2,
    Origin: "https://gaincash.me",
    Referer: url,
  },
  body: JSON.stringify({
    _token: csrf,
    components: [{ snapshot, updates: {}, calls: [{ path: "", method: "__lazyLoad", params: [lazy] }] }],
  }),
});
const out = await lw.json();
const h = out.components[0].effects.html;
const $3 = cheerio.load(h);
const card = $3(".fade-in-scale").first();
console.log("title raw", card.attr("title")?.slice(0, 200));
