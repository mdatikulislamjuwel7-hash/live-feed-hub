import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 8000));

const userId = await page.$eval(".earnFeed-item", (el) => el.getAttribute("data-user"));

await page.evaluate(async (uid) => {
  const res = await fetch(`/user/${uid}`, {
    headers: { Accept: "text/html", "X-Requested-With": "XMLHttpRequest" },
  });
  window.__userHtml = await res.text();
}, userId);

const snippet = await page.evaluate(() => {
  const t = window.__userHtml || "";
  const needles = ["country", "Country", "flag", "Germany", "United States"];
  const hits = {};
  for (const n of needles) {
    const i = t.toLowerCase().indexOf(n.toLowerCase());
    hits[n] = i >= 0 ? t.slice(i, i + 150).replace(/\s+/g, " ") : null;
  }
  return { len: t.length, hits, hasModal: t.includes("user-details") };
});

console.log("userId", userId, snippet);

await page.click(".earnFeed-item");
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const found = await page.evaluate(() => {
    const m =
      document.querySelector("#user-details-modal.show") ||
      document.querySelector(".modal.show") ||
      document.querySelector("[role='dialog']");
    return m ? m.innerText.slice(0, 1000) : null;
  });
  if (found) {
    console.log("MODAL", found);
    break;
  }
}

await browser.close();
