import * as cheerio from "cheerio";

function decodeAttr(value = "") {
  return String(value).replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

const urls = [
  "https://jjreward.com/login",
  "https://hogocash.com/login",
  "https://app.jjreward.com/",
  "https://earn.jjreward.com/",
  "https://panel.jjreward.com/",
];

for (const u of urls) {
  try {
    const r = await fetch(u, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });
    const t = await r.text();
    const $ = cheerio.load(t);
    const comps = new Set();
    $("[wire\\:snapshot]").each((_, e) => {
      try {
        comps.add(JSON.parse(decodeAttr($(e).attr("wire:snapshot") || "")).memo.name);
      } catch {}
    });
    console.log(
      u,
      "->",
      r.status,
      r.url,
      [...comps].join(",") || "no-livewire",
      "cashout",
      $(".cashout_item").length
    );
  } catch (e) {
    console.log(u, "ERR", e.message);
  }
}
