import { io } from "socket.io-client";

const SOCKET_URL = "https://servers.faucetify.io/";

/**
 * One-shot socket session: reliable offer names (offername field).
 * @param {number} [waitMs]
 * @returns {Promise<Record<string, unknown>[]>}
 */
export function fetchEarnFeedOnce(waitMs = 10000) {
  return new Promise((resolve, reject) => {
    /** @type {Map<string, Record<string, unknown>>} */
    const seen = new Map();
    let settled = false;

    const s = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: false,
      timeout: 7000,
    });

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimeout);
      clearTimeout(collectTimeout);
      s.removeAllListeners();
      s.close();
      const rows = [...seen.values()].filter((r) => r.feedType === "earn");
      if (!rows.length) {
        reject(new Error("no earn feed rows from socket"));
        return;
      }
      resolve(rows.slice(-40));
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimeout);
      clearTimeout(collectTimeout);
      s.removeAllListeners();
      s.close();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const onFeed = (e) => {
      if (e?.feedType === "earn" && e.id != null) seen.set(String(e.id), e);
    };
    const onPack = (e) => {
      for (const row of e?.feedPack ?? []) onFeed(row);
    };

    s.on("connect", () => {
      s.on("activityFeed", onFeed);
      s.on("activityFeedPacket", onPack);
    });
    s.on("activityFeed", onFeed);
    s.on("activityFeedPacket", onPack);
    s.on("connect_error", (err) => fail(err));

    const collectTimeout = setTimeout(finish, waitMs);
    const connectTimeout = setTimeout(
      () => fail(new Error("PaidCash socket connect timeout")),
      9000
    );
  });
}

/**
 * @param {number} [waitMs]
 * @param {number} [attempts]
 */
export async function collectEarnFeed(waitMs = 10000, attempts = 3) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const rows = await fetchEarnFeedOnce(waitMs + i * 2000);
      const withOffer = rows.filter((r) => r.offername);
      if (withOffer.length > 0) return rows;
      if (rows.length > 0) return rows;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("PaidCash socket failed");
}

/** @type {import('socket.io-client').Socket | null} */
let detailsSocket = null;

/**
 * @returns {Promise<import('socket.io-client').Socket>}
 */
async function getDetailsSocket() {
  if (detailsSocket?.connected) return detailsSocket;
  if (detailsSocket) {
    detailsSocket.removeAllListeners();
    detailsSocket.close();
    detailsSocket = null;
  }
  return new Promise((resolve, reject) => {
    const s = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: false,
      timeout: 7000,
    });
    const t = setTimeout(() => {
      s.close();
      reject(new Error("details socket timeout"));
    }, 9000);
    s.on("connect", () => {
      clearTimeout(t);
      detailsSocket = s;
      resolve(s);
    });
    s.on("connect_error", (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

/**
 * @param {import('socket.io-client').Socket} s
 * @param {string|number} userId
 */
function fetchOneUserDetails(s, userId) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      s.off("userDetails", onDetails);
      resolve(null);
    }, 1800);

    function onDetails(payload) {
      const d = payload?.userDetails;
      if (!d || String(d.userId) !== String(userId)) return;
      clearTimeout(timer);
      s.off("userDetails", onDetails);
      resolve(d);
    }

    s.on("userDetails", onDetails);
    s.emit("getUserDetails", { user: userId });
  });
}

/**
 * @param {(string|number)[]} userIds
 */
export async function fetchUserDetailsBatch(userIds) {
  const s = await getDetailsSocket();
  const uniq = [...new Set(userIds.map(String))].slice(0, 12);
  const map = new Map();
  const rows = await Promise.all(uniq.map((uid) => fetchOneUserDetails(s, uid)));
  for (const details of rows) {
    if (details) map.set(String(details.userId), details);
  }
  return map;
}

const ISO2_NAMES = {
  US: "United States",
  GB: "United Kingdom",
  DE: "Germany",
  FR: "France",
  CA: "Canada",
  AU: "Australia",
  IN: "India",
  BD: "Bangladesh",
  BR: "Brazil",
  PH: "Philippines",
  NG: "Nigeria",
  PK: "Pakistan",
  ID: "Indonesia",
  MX: "Mexico",
  ES: "Spain",
  IT: "Italy",
  NL: "Netherlands",
  PL: "Poland",
  RO: "Romania",
  KE: "Kenya",
};

/**
 * @param {string} [code]
 * @returns {string|null}
 */
export function formatCountry(code) {
  if (!code) return null;
  const c = String(code).trim().toUpperCase();
  return ISO2_NAMES[c] || c;
}
