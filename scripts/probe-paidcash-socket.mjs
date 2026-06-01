import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

await page.evaluateOnNewDocument(() => {
  window.__socketMsgs = [];
  const orig = WebSocket.prototype.send;
  // socket.io uses polling too; hook io when loaded
  const hook = () => {
    if (!window.io || window.__ioHooked) return;
    window.__ioHooked = true;
    const origIo = window.io;
    window.io = function (...args) {
      const socket = origIo.apply(this, args);
      socket.onAny((event, ...data) => {
        window.__socketMsgs.push({ event, data: JSON.stringify(data).slice(0, 500) });
      });
      return socket;
    };
    Object.assign(window.io, origIo);
  };
  setInterval(hook, 500);
});

await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 15000));

const msgs = await page.evaluate(() => window.__socketMsgs || []);
console.log("socket msgs", msgs.length);
const withCountry = msgs.filter((m) => /country|offer|earn|feed|wall/i.test(m.data || m.event));
console.log(JSON.stringify(withCountry.slice(0, 15), null, 2));

await page.click(".earnFeed-item");
await new Promise((r) => setTimeout(r, 4000));

const afterClick = await page.evaluate(() => ({
  msgs: (window.__socketMsgs || []).slice(-10),
  body: document.body.innerText.includes("Country"),
  modalText: (document.querySelector(".modal.show")?.innerText || "").slice(0, 600),
}));

console.log("after click", JSON.stringify(afterClick, null, 2));

await browser.close();
