import * as cheerio from "cheerio";

function decodeAttr(value = "") {
  return String(value).replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

const url = "https://gaincash.me/earn";
try {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
  const t = await r.text();
  console.log("final", r.url, "live-lead", t.includes("user.widget.live-lead"), "cashout", t.includes("live-cashout-list"));
  const $ = cheerio.load(t);
  $("[wire\\:snapshot]").each((_, e) => {
    try {
      console.log(JSON.parse(decodeAttr($(e).attr("wire:snapshot") || "")).memo.name);
    } catch {}
  });
} catch (e) {
  console.log("ERR", e.message);
}
