import puppeteer from "puppeteer";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cookiePath = join(__dirname, "..", "config", "gamersuniverse.cookie");

if (!existsSync(cookiePath)) {
  console.log("NO_COOKIE_FILE - create config/gamersuniverse.cookie from browser");
  process.exit(0);
}

const cookieHeader = readFileSync(cookiePath, "utf8").trim();
const cookies = cookieHeader.split(";").map((p) => {
  const [name, ...v] = p.trim().split("=");
  return { name, value: v.join("="), domain: "gamersunivers.com" };
});

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setCookie(...cookies.filter((c) => c.name && c.value));

const hits = [];
page.on("response", async (res) => {
  const u = res.url();
  if (!/ajax\.php|live/i.test(u)) return;
  let body = "";
  try {
    body = (await res.text()).slice(0, 800);
  } catch {}
  if (body.length > 2) hits.push({ u, body });
});

await page.goto("https://gamersunivers.com/page/live.html", {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 8000));

const info = await page.evaluate(() => ({
  title: document.title,
  hasLC: document.body.innerText.includes("Live Completions"),
  hasOffery: document.body.innerText.includes("Offery"),
  hasTillamook: document.body.innerText.includes("Tillamook"),
  text: document.body.innerText.slice(0, 2000),
  cards: [...document.querySelectorAll("[class*='completion'],[class*='live-'],.card")].slice(0, 5).map((el) => ({
    cls: el.className,
    t: el.innerText?.slice(0, 150),
  })),
}));

console.log(JSON.stringify(info, null, 2));
console.log("xhr", hits);
await browser.close();
