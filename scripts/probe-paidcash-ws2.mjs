import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const client = await page.createCDPSession();
await client.send("Network.enable");

const frames = [];
client.on("Network.webSocketFrameReceived", ({ response }) => {
  frames.push(response.payloadData || "");
});
client.on("Network.webSocketFrameSent", ({ response }) => {
  frames.push(">>" + (response.payloadData || ""));
});

await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 8000));

const userId = await page.$eval(".earnFeed-item", (el) => el.getAttribute("data-user"));
await page.evaluate((uid) => {
  window.dispatchEvent(
    new CustomEvent("showUserID", { detail: { userID: uid } })
  );
}, userId);

await new Promise((r) => setTimeout(r, 6000));

const interesting = frames.filter((f) =>
  /userDetails|getUserDetails|country/i.test(f)
);
console.log("interesting", interesting.length);
for (const f of interesting.slice(0, 15)) console.log(f.slice(0, 600), "\n---");

await browser.close();
