import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const posts = [];

page.on("request", (req) => {
  if (req.url().includes("ajax.php")) {
    posts.push({ url: req.url(), data: req.postData() });
  }
});

page.on("response", async (res) => {
  if (!res.url().includes("ajax.php")) return;
  let body = "";
  try {
    body = (await res.text()).slice(0, 1000);
  } catch {}
  posts.push({ phase: "response", url: res.url(), body });
});

// try member dashboard urls
const urls = [
  "https://gamersunivers.com/page/live.html",
  "https://gamersunivers.com/page/index.html",
  "https://gamersunivers.com/page/home.html",
  "https://gamersunivers.com/page/dashboard.html",
];

for (const url of urls) {
  posts.length = 0;
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
    await new Promise((r) => setTimeout(r, 5000));
    const lc = await page.evaluate(() =>
      document.body.innerText.includes("Live Completions")
    );
    console.log("\nURL", url, "LC", lc, "ajax calls", posts.length);
    for (const p of posts) console.log(JSON.stringify(p));
  } catch (e) {
    console.log(url, e.message);
  }
}

await browser.close();
