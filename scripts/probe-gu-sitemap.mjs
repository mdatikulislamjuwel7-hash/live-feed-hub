const paths = [
  "home.html",
  "dashboard.html",
  "member.html",
  "user.html",
  "panel.html",
  "offers.html",
  "withdraw.html",
  "transactions.html",
  "leaderboard.html",
  "settings.html",
  "live.html",
  "completions.html",
  "live-completions.html",
];

for (const p of paths) {
  const r = await fetch(`https://gamersunivers.com/page/${p}`);
  const t = await r.text();
  const dash = t.includes("toggle-sidebar") || t.includes("Earn Coins");
  const lc = t.includes("Live Completions");
  if (r.status === 200 && (dash || lc || t.length !== 11923)) {
    console.log(p, r.status, t.length, dash ? "DASH" : "", lc ? "LIVE" : "");
  }
}
