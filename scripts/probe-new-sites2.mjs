import * as cheerio from "cheerio";
import { fetchLaravelLiveFeed } from "../src/adapters/laravel-live-feed.js";

async function testLaravel(id, name, url, mode, component) {
  const source = { id, name, url, laravelMode: mode, livewireComponent: component, limit: 30 };
  try {
    const events = await fetchLaravelLiveFeed(source);
    console.log(id, "OK", events.length, events.slice(0, 2).map((e) => `${e.user}|${e.offerName}|${e.rawAmount}`));
  } catch (e) {
    console.log(id, "FAIL", e.message);
  }
}

await testLaravel("boostlyearn", "BoostlyEarn", "https://boostlyearn.com/", "live-cashouts");
await testLaravel("boostlyearn", "BoostlyEarn", "https://boostlyearn.com/", "live-leads");
await testLaravel("boostlyearn", "BoostlyEarn", "https://boostlyearn.com/", "cashout-list");
await testLaravel("earng", "EarnG", "https://earng.net/earn", "live-leads");
await testLaravel("earng", "EarnG", "https://earng.net/earn", "live-cashouts");
await testLaravel("earng", "EarnG", "https://earng.net/earn", "cashout-list");

// rubcashly HTML
const r = await fetch("https://rubcashly.com/", { headers: { "User-Agent": "Mozilla/5.0" } });
const html = await r.text();
const $ = cheerio.load(html);
const completed = [];
$("h3").each((_, h) => {
  const title = $(h).text().trim();
  if (!title.includes("Recent Completed")) return;
  $(h).parent().find("p, span, div").each((__, el) => {
    const t = $(el).text().trim();
    if (t && t.length < 40) completed.push(t);
  });
});
console.log("rubcashly texts", completed.slice(0, 20));

// earnlycash
const e = await fetch("https://earnlycash.com/", { headers: { "User-Agent": "Mozilla/5.0" } });
const eh = await e.text();
const $e = cheerio.load(eh);
console.log("earnlycash swiper", $e(".swiper-slide").length, "feed items", $e("[class*='feed']").length);
const scripts = eh.match(/api[^\"']+/gi)?.slice(0, 10);
console.log("earnlycash api hints", scripts);

// jokercash
const j = await fetch("https://joker-cash.com/", { headers: { "User-Agent": "Mozilla/5.0" } });
const jh = await j.text();
console.log("jokercash", jh.slice(0, 500));
console.log("jokercash scripts", [...jh.matchAll(/src=\"([^\"]+)\"/g)].map((m) => m[1]).slice(0, 10));
