import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 8000));

const html = await page.content();
for (const needle of [
  "Wall:",
  "Offer:",
  "Amount:",
  "data-offer",
  "data-wall",
  "earnfeed",
  "earning-feed",
]) {
  const i = html.indexOf(needle);
  console.log(needle, i >= 0 ? html.slice(i, i + 250).replace(/\s+/g, " ") : "MISSING");
}

const item = await page.$(".earnFeed-item");
if (item) {
  const box = await item.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  }
}
await new Promise((r) => setTimeout(r, 2000));

const hoverInfo = await page.evaluate(() => {
  const hits = [];
  for (const el of document.querySelectorAll("*")) {
    const t = el.innerText || "";
    if (t.includes("Wall:") && t.includes("Offer:") && t.length < 400) {
      hits.push({
        tag: el.tagName,
        cls: el.className,
        text: t,
        hidden: getComputedStyle(el).display === "none",
        opacity: getComputedStyle(el).opacity,
      });
    }
  }
  const item = document.querySelector(".earnFeed-item");
  const hidden = item
    ? [...item.querySelectorAll("[style*='display'],[hidden],[class*='tooltip']")].map(
        (el) => ({
          tag: el.tagName,
          cls: el.className,
          t: (el.textContent || "").slice(0, 120),
          html: (el.innerHTML || "").slice(0, 200),
        })
      )
    : [];
  const dataset = item ? { ...item.dataset } : {};
  return { hits: hits.slice(0, 5), hidden: hidden.slice(0, 8), dataset };
});

console.log("hoverInfo", JSON.stringify(hoverInfo, null, 2));

const tipHtml = await page.evaluate(() => {
  const el = document.querySelector(".feed-tooltip");
  return el ? { html: el.innerHTML, text: el.innerText } : null;
});
console.log("tipHtml", JSON.stringify(tipHtml, null, 2));

await browser.close();
