import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://apucash.com", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("#last_offers .offer-wrapper", { timeout: 20000 });

const users = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll("#last_offers img[role='button']").forEach((img) => {
    const parent = img.closest("[wire\\:key]");
    const html = parent?.outerHTML || img.outerHTML;
    const m = html.match(/userId':\s*'(\d+)'/);
    const user = img.getAttribute("alt") || "";
    if (m) out.push({ userId: m[1], user });
  });
  return out.slice(0, 8);
});

async function fetchProfile(userId) {
  await page.evaluate((id) => {
    window.Livewire?.dispatch?.("openProfileModal", { userId: id });
  }, userId);
  await new Promise((r) => setTimeout(r, 2500));
  return page.evaluate(() => {
    const modal = document.querySelector("#profileModal .modal-dialog");
    const text = modal?.innerText || "";
    const isPrivate = /Private Account/i.test(text);
    const countryLine = [...(modal?.querySelectorAll("*") || [])]
      .map((el) => el.childNodes.length === 1 ? el.textContent?.trim() : "")
      .find((t) => t && t.length > 2 && t.length < 40 && !t.includes("Joined") && !t.includes("Total") && !t.includes("Activity") && !t.includes("requires") && !/^\d/.test(t) && !t.includes("💰"));
    const activities = [];
    if (!isPrivate && modal) {
      modal.querySelectorAll(".activity-item, [class*='activity'], li, .offer-item").forEach((el) => {
        const t = el.textContent?.trim();
        if (t && t.length > 3 && t.length < 120) activities.push(t);
      });
    }
    const username = modal?.querySelector("h4, h3, .username, [class*='user']")?.textContent?.trim();
    return { isPrivate, country: countryLine || "", text: text.slice(0, 600), activities, username };
  });
}

for (const u of users) {
  const p = await fetchProfile(u.userId);
  console.log(u.user, u.userId, p.isPrivate ? "PRIVATE" : "PUBLIC", p.country, p.activities?.slice(0, 2));
  await page.keyboard.press("Escape").catch(() => {});
  await new Promise((r) => setTimeout(r, 500));
}

await browser.close();
