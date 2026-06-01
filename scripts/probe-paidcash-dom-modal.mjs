import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 10000));

const html = await page.content();
console.log("has modal id", html.includes("user-details-modal"));
const idx = html.indexOf("user-details");
console.log("idx snippet", idx >= 0 ? html.slice(idx, idx + 500) : "none");

const apiHits = [];
page.on("response", async (res) => {
  const u = res.url();
  if (!/paidcash\.co/i.test(u)) return;
  if (/\/api\/|graphql|socket|user/i.test(u)) {
    let body = "";
    try {
      body = (await res.text()).slice(0, 800);
    } catch {}
    if (!body.startsWith("<!doctype")) apiHits.push({ u, body });
  }
});

const el = await page.$(".earnFeed-item");
const box = await el.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await new Promise((r) => setTimeout(r, 6000));

console.log("api after click", JSON.stringify(apiHits, null, 2));

const modal = await page.evaluate(() => {
  const all = [...document.querySelectorAll("*")].filter((el) => {
    const t = el.innerText || "";
    return t.length < 800 && /country/i.test(t);
  });
  return all.slice(0, 5).map((el) => ({
    tag: el.tagName,
    cls: el.className,
    text: el.innerText,
  }));
});
console.log("country els", JSON.stringify(modal, null, 2));

await browser.close();
