import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const client = await page.createCDPSession();
await client.send("Network.enable");

const sent = [];
const recv = [];
client.on("Network.webSocketFrameSent", ({ response }) => {
  sent.push(response.payloadData || "");
});
client.on("Network.webSocketFrameReceived", ({ response }) => {
  recv.push(response.payloadData || "");
});

await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 5000));

const el = await page.$(".earnFeed-item");
const box = await el.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await new Promise((r) => setTimeout(r, 6000));

const s = sent.filter((f) => /user|User|Details/.test(f));
const r = recv.filter((f) => /user|User|Details|country/i.test(f));
console.log("sent", s);
console.log("recv", r.slice(0, 10));

await browser.close();
