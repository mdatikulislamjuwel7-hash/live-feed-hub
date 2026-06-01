const html = await (await fetch("https://gamersunivers.com/page/login.html")).text();
const m = html.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]+?\}\)\)/);
if (!m) {
  console.log("no packer");
  process.exit(0);
}
// extract packed string - run in vm is risky; search raw html for ajax actions
const actions = [...html.matchAll(/a=([a-zA-Z0-9_]+)/g)].map((x) => x[1]);
console.log("actions in html", [...new Set(actions)]);

// fetch dashboard-sized pages - try live with session from registering? skip

// brute ajax with common action names from GPT sites
const guesses = [
  "getLiveCompletions",
  "loadLiveCompletions",
  "liveCompletionsFeed",
  "completions_live",
  "live_completions_feed",
  "get_live_completions",
  "fetch_completions",
  "recent_activity",
  "live_activity",
  "earn_feed",
  "offers_completed",
];
for (const a of guesses) {
  const r = await fetch("https://gamersunivers.com/system/ajax.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `a=${a}&limit=50`,
  });
  const t = await r.text();
  if (t.length > 2) console.log("HIT", a, t.slice(0, 300));
}
