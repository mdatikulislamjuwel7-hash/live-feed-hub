import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const hits = [];

page.on("response", async (res) => {
  const u = res.url();
  if (!/gamersunivers|gu\.|api\./i.test(u)) return;
  let body = "";
  try {
    body = (await res.text()).slice(0, 1200);
  } catch {}
  if (body && !body.startsWith("<!DOCTYPE") && body.length > 10) {
    hits.push({ u, body });
  }
});

await page.goto("https://gamersunivers.com/page/login.html", {
  waitUntil: "networkidle2",
});
await new Promise((r) => setTimeout(r, 3000));

const forms = await page.evaluate(() => {
  return [...document.querySelectorAll("form")].map((f) => ({
    action: f.action,
    method: f.method,
    inputs: [...f.querySelectorAll("input")].map((i) => ({
      name: i.name,
      type: i.type,
    })),
  }));
});
console.log("forms", JSON.stringify(forms, null, 2));

const scripts = await page.evaluate(() =>
  [...document.querySelectorAll("script[src]")].map((s) => s.src)
);
console.log("scripts", scripts);

console.log("hits", JSON.stringify(hits, null, 2));

await browser.close();
