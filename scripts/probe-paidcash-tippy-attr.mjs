import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 8000));

const tippy = await page.evaluate(() => {
  const item = document.querySelector(".earnFeed-item");
  return {
    title: item?.getAttribute("title"),
    aria: item?.getAttribute("aria-label"),
    dataAttrs: item ? Object.fromEntries([...item.attributes].map((a) => [a.name, a.value])) : {},
    instance: item?._tippy?.props?.content,
    innerHidden: item?.innerHTML.includes("feed-tooltip"),
  };
});

console.log(JSON.stringify(tippy, null, 2));

// puppeteer hover
const el = await page.$(".earnFeed-item");
const box = await el.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await new Promise((r) => setTimeout(r, 1000));

const inst = await page.evaluate(() => {
  const item = document.querySelector(".earnFeed-item");
  return {
    hasTippy: !!item?._tippy,
    content: typeof item?._tippy?.props?.content === "string" ? item._tippy.props.content.slice(0, 400) : null,
  };
});
console.log("instance", JSON.stringify(inst, null, 2));

await browser.close();
