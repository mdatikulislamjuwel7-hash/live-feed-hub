const paths = [
  "/system/live.php",
  "/system/dashboard.php",
  "/system/index.php",
  "/system/home.php",
  "/page/live.php",
  "/page/dashboard.php",
  "/page/member/live.html",
  "/page/user/live.html",
];

for (const p of paths) {
  const r = await fetch(`https://gamersunivers.com${p}`, {
    redirect: "manual",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const loc = r.headers.get("location");
  let t = "";
  if (r.status === 200) t = await r.text();
  console.log(
    p,
    r.status,
    loc || "",
    t.length,
    t.includes("Live Completions") ? "LC" : "",
    t.includes("loginForm") ? "LOGIN" : ""
  );
}
