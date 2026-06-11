import * as cheerio from "cheerio";

const urls = [
  ["jj", "https://jjreward.com/earn"],
  ["hogo", "https://hogocash.com/earn"],
  ["jump", "https://jumptask.io/"],
  ["lun", "https://lunairo.com/"],
];

for (const [name, url] of urls) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await r.text();
  const $ = cheerio.load(html);
  const comps = new Set();
  $("[wire\\:snapshot]").each((_, el) => {
    const raw = ($(el).attr("wire:snapshot") || "")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");
    try {
      comps.add(JSON.parse(raw).memo?.name);
    } catch {}
  });
  console.log(
    name,
    [...comps].join(", ") || "none",
    "cashout_item",
    $(".cashout_item").length,
    "swiper",
    $(".swiper-slide").length
  );
}
