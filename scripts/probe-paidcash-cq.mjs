import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });

const result = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 60; i++) {
    if (window.CQ) break;
    await wait(500);
  }
  if (!window.CQ) return { error: "no CQ" };

  const feeds = [];
  const details = [];

  return new Promise((resolve) => {
    const done = () =>
      resolve({
        feeds: feeds.slice(0, 5),
        details: details.slice(0, 3),
        feedCount: feeds.length,
      });

    window.CQ.on("activityFeed", (e) => {
      feeds.push(e);
    });
    window.CQ.on("activityFeedPacket", (e) => {
      if (e?.feedPack) feeds.push(...e.feedPack);
    });
    window.CQ.on("userDetails", (e) => {
      details.push(e);
    });

    // trigger user details for first feed item
    setTimeout(() => {
      const uid = document
        .querySelector(".earnFeed-item")
        ?.getAttribute("data-user");
      if (uid) window.CQ.emit("getUserDetails", { user: uid });
    }, 2000);

    setTimeout(done, 12000);
  });
});

console.log(JSON.stringify(result, null, 2));

await browser.close();
