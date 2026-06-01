const actions = [
  "live_completions",
  "liveCompletions",
  "completions",
  "get_completions",
  "live_feed",
  "recent_completions",
  "payouts",
  "live_payouts",
  "activity",
  "live",
];

for (const a of actions) {
  const body = new URLSearchParams({ a, limit: "50" });
  const r = await fetch("https://gamersunivers.com/system/ajax.php", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: body.toString(),
  });
  const t = await r.text();
  const ok = !t.includes("404") && t.length > 5 && !t.startsWith("<!");
  console.log(a, r.status, ok ? t.slice(0, 200) : t.slice(0, 80));
}
