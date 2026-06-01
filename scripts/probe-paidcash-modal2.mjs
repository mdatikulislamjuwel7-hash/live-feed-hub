import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const apiHits = [];

page.on("response", async (res) => {
  const u = res.url();
  if (!/paidcash|faucetify|\/api\//i.test(u)) return;
  if (!/user|profile|modal|member|earn/i.test(u)) return;
  let body = "";
  try {
    body = (await res.text()).slice(0, 800);
  } catch {}
  apiHits.push({ u, status: res.status(), body });
});

await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 8000));

const userId = await page.$eval(".earnFeed-item", (el) => el.getAttribute("data-user"));

await page.evaluate((uid) => {
  const el = document.querySelector(`[data-user="${uid}"]`);
  if (el) el.click();
  if (window.jQuery) {
    window.jQuery("#user-details-modal").modal?.("show");
  }
}, userId);

await new Promise((r) => setTimeout(r, 5000));

const modal = await page.evaluate(() => {
  const modal =
    document.querySelector("#user-details-modal") ||
    document.querySelector("[id*='user-details']");
  const allModals = [...document.querySelectorAll(".modal")].map((m) => ({
    id: m.id,
    classes: m.className,
    display: getComputedStyle(m).display,
    text: (m.innerText || "").slice(0, 800),
  }));
  return {
    modal: modal
      ? {
          id: modal.id,
          classes: modal.className,
          text: (modal.innerText || "").slice(0, 1200),
        }
      : null,
    allModals,
  };
});

console.log("userId", userId);
console.log("apiHits", JSON.stringify(apiHits, null, 2));
console.log("modal", JSON.stringify(modal, null, 2));

await browser.close();
