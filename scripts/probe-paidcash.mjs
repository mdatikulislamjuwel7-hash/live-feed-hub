import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://paidcash.co", { waitUntil: "networkidle2", timeout: 60000 });

await new Promise((r) => setTimeout(r, 5000));

const info = await page.evaluate(() => {
  const text = document.body.innerText.slice(0, 3000);
  const hasLastOffers = !!document.querySelector("#last_offers");
  const hasLivewire = !!window.Livewire;
  const offers = document.querySelectorAll(".offer-wrapper").length;
  const ticker = document.querySelectorAll("[class*='offer']").length;
  return { text, hasLastOffers, hasLivewire, offers, ticker };
});

console.log(JSON.stringify(info, null, 2));

const reqs = [];
page.on("response", async (res) => {
  const u = res.url();
  if (
    u.includes("activity") ||
    u.includes("ticker") ||
    u.includes("live") ||
    u.includes("feed")
  ) {
    reqs.push({ u, status: res.status(), type: res.headers()["content-type"] });
  }
});

await new Promise((r) => setTimeout(r, 15000));
console.log("network", reqs.slice(0, 15));

await browser.close();
