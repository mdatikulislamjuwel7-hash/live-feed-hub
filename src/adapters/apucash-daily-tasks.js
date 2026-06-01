import * as cheerio from "cheerio";

/** @type {Map<number, string> | null} */
let rewardToTask = null;
let loadedAt = 0;
const TTL_MS = 60 * 60 * 1000;

/**
 * Load Daily Tasks coin → task label from ApuCash /rewards page.
 */
export async function getDailyTaskLabel(coins) {
  if (!rewardToTask || Date.now() - loadedAt > TTL_MS) {
    try {
      const res = await fetch("https://apucash.com/rewards", {
        headers: { Accept: "text/html", "User-Agent": "LiveFeedHub/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const $ = cheerio.load(await res.text());
        const map = new Map();
        $("h4, h5, p, span").each((_, el) => {
          const text = $(el).text().replace(/\s+/g, " ").trim();
          const rewardMatch = text.match(/Rewards?:\s*(\d+)\s*💰/i);
          if (!rewardMatch) return;
          const amount = parseInt(rewardMatch[1], 10);
          const prev = $(el).prevAll("p, span, h4").first().text().trim();
          const label = prev || text.split("Rewards")[0].trim();
          if (label && label.length < 80) map.set(amount, label);
        });
        if (map.size) {
          rewardToTask = map;
          loadedAt = Date.now();
        }
      }
    } catch {
      /* use fallback */
    }
    if (!rewardToTask) {
      rewardToTask = new Map([
        [10, "Complete 1 offer"],
        [25, "Free bonus / daily bonus"],
        [50, "Complete 5 offers"],
        [75, "Complete 10 offers"],
        [100, "Sign-up bounce bonus"],
        [150, "Earn 1500 coins streak"],
        [300, "Earn 10000 coins streak"],
        [400, "Adsprem offer"],
        [600, "Adsprem offer"],
        [1250, "High reward offer"],
      ]);
      loadedAt = Date.now();
    }
  }
  return rewardToTask.get(coins) || null;
}
