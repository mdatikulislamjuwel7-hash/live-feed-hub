import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const xhr = [];

page.on("request", (req) => {
  if (req.method() === "POST" && /gamersunivers/i.test(req.url())) {
    xhr.push({ url: req.url(), post: req.postData()?.slice(0, 200) });
  }
});

page.on("response", async (res) => {
  const u = res.url();
  if (!/gamersunivers/i.test(u) || res.request().method() !== "POST") return;
  let body = "";
  try {
    body = (await res.text()).slice(0, 500);
  } catch {}
  xhr.push({ url: u, status: res.status(), body });
});

await page.goto("https://gamersunivers.com/page/login.html", {
  waitUntil: "networkidle2",
});
await page.type("#userLogin", "test@test.com");
await page.type("#userPass", "wrongpass");
await page.click("#loginForm button[type=submit]");
await new Promise((r) => setTimeout(r, 5000));

console.log(JSON.stringify(xhr, null, 2));
await browser.close();
