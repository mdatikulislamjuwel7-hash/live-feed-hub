import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 8000));

await page.evaluate(() => {
  window.__userDetails = [];
  window.addEventListener("showUserID", (e) => {
    window.__lastUserID = e.detail?.userID;
  });
});

const userId = await page.$eval(".earnFeed-item", (el) => el.getAttribute("data-user"));

await page.evaluate((uid) => {
  window.dispatchEvent(
    new CustomEvent("showUserID", { detail: { userID: uid } })
  );
}, userId);

await new Promise((r) => setTimeout(r, 5000));

const info = await page.evaluate(() => {
  const modal =
    document.querySelector("#user-details-modal") ||
    document.querySelector(".modal.show");
  const countryEls = [...document.querySelectorAll("*")].filter((el) => {
    const t = el.innerText || "";
    return t.length < 50 && /^(Country|🌍)/i.test(t);
  });
  return {
    lastUserID: window.__lastUserID,
    modal: modal?.innerText?.slice(0, 1200) || null,
    bodyHasGermany: document.body.innerText.includes("Germany"),
    countryEls: countryEls.slice(0, 5).map((e) => e.innerText),
    allModal: [...document.querySelectorAll(".modal")].map((m) => ({
      id: m.id,
      cls: m.className,
      show: m.classList.contains("show"),
      len: (m.innerText || "").length,
    })),
  };
});

console.log(JSON.stringify(info, null, 2));

await browser.close();
