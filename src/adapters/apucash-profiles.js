/** @typedef {import('./apucash-profile-types.js').UserProfile} UserProfile */

/** @type {Map<string, { at: number, data: UserProfile }>} */
const cache = new Map();
const CACHE_MS = 15 * 60 * 1000;
const MAX_PROFILES_PER_POLL = 10;

/**
 * @typedef {Object} UserProfile
 * @property {string} userId
 * @property {string} username
 * @property {string} country
 * @property {boolean} isPrivate
 * @property {Array<{ offerwall: string, offerName: string, amount: number, timeAgo: string }>} activities
 */

/**
 * @param {string} modalText
 * @returns {Partial<UserProfile>}
 */
export function parseProfileModalText(modalText) {
  const isPrivate = /Private Account/i.test(modalText);
  const usernameMatch = modalText.match(
    /\n([A-Za-z0-9_]{3,24})\n\nJoined/
  );
  const username = usernameMatch?.[1]?.trim() || "";

  const joinedIdx = modalText.indexOf("Joined");
  let country = "";
  if (joinedIdx >= 0) {
    const after = modalText.slice(joinedIdx).split("\n").map((l) => l.trim());
    for (let i = 1; i < Math.min(after.length, 6); i++) {
      const line = after[i];
      if (
        line &&
        !line.includes("ago") &&
        !line.includes("requires") &&
        !line.includes("💰") &&
        !line.startsWith("Total") &&
        line.length < 50 &&
        !/^\d/.test(line)
      ) {
        country = line;
        break;
      }
    }
  }

  /** @type {UserProfile['activities']} */
  const activities = [];
  if (!isPrivate) {
    const actIdx = modalText.indexOf("Activity");
    if (actIdx >= 0) {
      const lines = modalText
        .slice(actIdx)
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      for (let i = 1; i < lines.length; i++) {
        if (
          lines[i].match(/Showing|results|Previous|Next|‹|›/) ||
          /^\d+$/.test(lines[i])
        ) {
          break;
        }
        const offerwall = lines[i];
        const offerName = lines[i + 1];
        const amountRaw = lines[i + 2];
        const timeAgo = lines[i + 3];
        if (
          offerName &&
          amountRaw &&
          timeAgo &&
          /\bago\b/i.test(timeAgo) &&
          offerwall.length < 40
        ) {
          activities.push({
            offerwall,
            offerName,
            amount: parseFloat(amountRaw.replace(/[^\d.]/g, "")) || 0,
            timeAgo,
          });
          i += 3;
        }
      }
    }
  }

  return { username, country, isPrivate, activities };
}

/**
 * @param {import('puppeteer').Page} page
 * @param {string} userId
 * @returns {Promise<UserProfile|null>}
 */
export async function fetchUserProfile(page, userId) {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return cached.data;
  }

  await page.evaluate((id) => {
    window.Livewire?.dispatch?.("openProfileModal", { userId: id });
  }, userId);

  await new Promise((r) => setTimeout(r, 2200));

  const parsed = await page.evaluate(() => {
    const modal = document.querySelector("#profileModal .modal-dialog");
    return modal?.innerText?.trim() || "";
  });

  if (!parsed || parsed.length < 20) return null;

  const partial = parseProfileModalText(parsed);
  /** @type {UserProfile} */
  const profile = {
    userId,
    username: partial.username || "",
    country: partial.country || "",
    isPrivate: !!partial.isPrivate,
    activities: partial.activities || [],
  };

  cache.set(userId, { at: Date.now(), data: profile });
  return profile;
}

/**
 * @param {import('puppeteer').Page} page
 * @param {Array<{ userId: string, user: string }>} users
 * @returns {Promise<Map<string, UserProfile>>}
 */
export async function fetchProfilesBatch(page, users) {
  const map = new Map();
  const unique = [];
  const seen = new Set();
  for (const u of users) {
    if (!u.userId || seen.has(u.userId)) continue;
    seen.add(u.userId);
    unique.push(u);
    if (unique.length >= MAX_PROFILES_PER_POLL) break;
  }

  for (const u of unique) {
    try {
      const profile = await fetchUserProfile(page, u.userId);
      if (profile) map.set(u.userId, profile);
    } catch {
      /* skip */
    }
    await page.evaluate(() => {
      const btn = document.querySelector("#profileModal .btn-close, #profileModal [data-bs-dismiss='modal']");
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
  }

  return map;
}

/**
 * @param {UserProfile} profile
 * @param {string} offerwall
 * @param {number} coinAmount
 */
export function matchActivity(profile, offerwall, coinAmount) {
  if (!profile.activities?.length) return null;
  const exact = profile.activities.find(
    (a) =>
      a.offerwall.trim().toLowerCase() === offerwall.trim().toLowerCase() &&
      Math.abs(a.amount - coinAmount) < 0.02
  );
  if (exact) return exact;
  return profile.activities.find(
    (a) => a.offerwall.trim().toLowerCase() === offerwall.trim().toLowerCase()
  );
}

export { MAX_PROFILES_PER_POLL };
