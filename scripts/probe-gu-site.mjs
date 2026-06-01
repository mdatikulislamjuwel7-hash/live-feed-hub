const html = await (await fetch("https://gamersunivers.com/")).text();
const scripts = html.match(/src="[^"]+"/g) || [];
console.log("scripts", scripts);
const links = html.match(/href="[^"]+"/g) || [];
console.log(
  "links",
  links.filter((l) => /live|dashboard|earn|completion|login|page/i.test(l))
);

// crawl common app paths
const paths = [
  "/login",
  "/register",
  "/page/dashboard.html",
  "/page/earn.html",
  "/page/live-completions",
  "/app/live",
  "/member/live",
];
for (const p of paths) {
  const r = await fetch(`https://gamersunivers.com${p}`, {
    redirect: "manual",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const loc = r.headers.get("location");
  console.log(p, r.status, loc || "");
}
