import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

await page.evaluateOnNewDocument(() => {
  window.__ioEvents = [];
  const wrap = () => {
    if (!window.io || window.__ioWrapped) return;
    const orig = window.io;
    window.io = function (...args) {
      const s = orig.apply(this, args);
      if (s && typeof s.on === "function") {
        const origOn = s.on.bind(s);
        s.on = function (ev, fn) {
          return origOn(ev, (...a) => {
            try {
              window.__ioEvents.push({
                ev,
                data: JSON.stringify(a).slice(0, 600),
              });
            } catch {}
            return fn?.(...a);
          });
        };
        if (typeof s.onAny === "function") {
          s.onAny((ev, ...a) => {
            window.__ioEvents.push({
              ev,
              data: JSON.stringify(a).slice(0, 600),
            });
          });
        }
      }
      return s;
    };
    Object.assign(window.io, orig);
    window.__ioWrapped = true;
  };
  const id = setInterval(() => {
    wrap();
    if (window.__ioWrapped) clearInterval(id);
  }, 200);
});

await page.goto("https://paidcash.co", { waitUntil: "networkidle2", timeout: 90000 });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 20000));

const events = await page.evaluate(() => window.__ioEvents || []);
console.log("events", events.length);
const interesting = events.filter(
  (e) =>
    /country|earn|feed|offer|user|wall/i.test(e.data || "") ||
    /country|earn|feed|offer|user/i.test(e.ev || "")
);
console.log(JSON.stringify(interesting.slice(0, 20), null, 2));

await browser.close();
