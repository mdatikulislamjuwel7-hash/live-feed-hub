const key = "AIzaSyBa68tA0-Nyx8B6vzy3u98eNgkEs-39SQg";
const project = "jokercash-app";
const collections = [
  "activities",
  "activity",
  "live_feed",
  "liveFeed",
  "recent_activities",
  "recentActivities",
  "transactions",
  "offers",
  "leaderboard",
  "users",
  "public_feed",
  "feed",
  "cashouts",
  "withdrawals",
  "completions",
];

for (const col of collections) {
  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${col}?pageSize=5&key=${key}`;
  const res = await fetch(url);
  const text = await res.text();
  if (res.ok && text.includes('"documents"')) {
    console.log("HIT", col, text.slice(0, 300));
  } else if (!text.includes("NOT_FOUND") && !text.includes("Permission denied")) {
    console.log(col, res.status, text.slice(0, 120));
  }
}

// list root collections (needs auth usually)
const listUrl = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:listCollectionIds?key=${key}`;
const listRes = await fetch(listUrl, { method: "POST", body: "{}" });
console.log("list", listRes.status, (await listRes.text()).slice(0, 200));
