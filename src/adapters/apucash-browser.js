import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import { fetchProfilesBatch } from "./apucash-profiles.js";
import { withBrowserLock } from "../browser-lock.js";

let browserPromise = null;

export function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browserPromise;
}

/**
 * @param {string} html
 * @returns {Array<{ userId: string, user: string }>}
 */
function extractTickerUsers(html) {
  const $ = cheerio.load(html);
  const users = [];
  $("#last_offers img[role='button']").each((_, img) => {
    const el = $(img);
    const wrapper = el.closest("[wire\\:key]");
    const htmlChunk = wrapper.html() || el.parent().html() || "";
    const m = htmlChunk.match(/userId':\s*'(\d+)'/);
    const user = el.attr("alt")?.trim() || "";
    if (m) users.push({ userId: m[1], user });
  });
  return users;
}

/**
 * Load ApuCash homepage, enrich profiles, return HTML + profile map.
 * @param {string} url
 * @returns {Promise<{ html: string, profiles: Map<string, import('./apucash-profile-types.js').UserProfile> }>}
 */
export async function fetchApucashRenderedHtml(url = "https://apucash.com") {
  return withBrowserLock(() => fetchApucashRenderedHtmlLocked(url));
}

async function fetchApucashRenderedHtmlLocked(url = "https://apucash.com") {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector("#last_offers .offer-wrapper", { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 3500));
    let html = await page.content();

    const tickerUsers = extractTickerUsers(html);
    const profiles = await fetchProfilesBatch(page, tickerUsers);
    console.log(
      `[apucash] profiles loaded: ${profiles.size}/${tickerUsers.length}`
    );

    return { html, profiles };
  } finally {
    await page.close();
  }
}
