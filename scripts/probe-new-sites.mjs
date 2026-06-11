import * as cheerio from "cheerio";

const sites = [
  { id: "boostlyearn", url: "https://boostlyearn.com/" },
  { id: "rubcashly", url: "https://rubcashly.com/" },
  { id: "earnlycash", url: "https://earnlycash.com/" },
  { id: "earng", url: "https://earng.net/earn" },
  { id: "jokercash", url: "https://joker-cash.com/" },
];

for (const s of sites) {
  try {
    const r = await fetch(s.url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });
    const t = await r.text();
    const keys = [
      "livewire",
      "live-cashout",
      "live-lead",
      "activity-ticker",
      "liveFeed",
      "Recent Completed",
      "wire:snapshot",
      "graphql",
      "Live.php",
      "recentEarners",
      "cashout_item",
      "swiper-slide",
    ];
    console.log(
      s.id,
      r.status,
      "len",
      t.length,
      keys.filter((k) => t.includes(k)).join(", ") || "NONE"
    );
    const $ = cheerio.load(t);
    console.log(
      "  snapshots",
      $("[wire\\:snapshot]").length,
      "tables",
      $("table").length
    );
    if (s.id === "rubcashly") {
      console.log("  completed h3", $("h3:contains(Recent)").length);
      console.log("  sample", t.match(/unflow[\s\S]{0,80}/)?.[0]?.slice(0, 80));
    }
    if (s.id === "earnlycash") {
      const lines = t.match(/GemiAd[\s\S]{0,40}/g)?.slice(0, 2);
      console.log("  gemiad", lines);
    }
  } catch (e) {
    console.log(s.id, "ERR", e.message);
  }
}
