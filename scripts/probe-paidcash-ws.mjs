import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const client = await page.createCDPSession();
await client.send("Network.enable");

const frames = [];
client.on("Network.webSocketFrameReceived", ({ response }) => {
  const payload = response.payloadData || "";
  if (/activityFeed|offername|country|userDetails/i.test(payload)) {
    frames.push(payload.slice(0, 1200));
  }
});

await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 20000));

console.log("frames", frames.length);
for (const f of frames.slice(0, 5)) console.log(f.slice(0, 500), "\n---");

await browser.close();
