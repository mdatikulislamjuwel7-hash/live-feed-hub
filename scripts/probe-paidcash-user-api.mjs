import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const hits = [];

page.on("response", async (res) => {
  const u = res.url();
  if (!u.includes("paidcash")) return;
  let body = "";
  try {
    body = (await res.text()).slice(0, 1200);
  } catch {}
  if (body && (body.includes("country") || body.includes("Country") || /user/i.test(u))) {
    hits.push({ u, body });
  }
});

await page.goto("https://paidcash.co/user/61552", {
  waitUntil: "networkidle2",
  timeout: 90000,
});
await new Promise((r) => setTimeout(r, 6000));

const text = await page.evaluate(() => document.body.innerText.slice(0, 2000));
console.log("body", text);
console.log("hits", JSON.stringify(hits, null, 2));

await browser.close();
