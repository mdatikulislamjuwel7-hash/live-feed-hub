const userId = "61552";
const paths = [
  `/api/user/${userId}`,
  `/api/users/${userId}`,
  `/api/user-details/${userId}`,
  `/api/profile/${userId}`,
  `/user/${userId}/details`,
  `/ajax/user/${userId}`,
];

for (const p of paths) {
  try {
    const r = await fetch(`https://paidcash.co${p}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    const t = await r.text();
    console.log(p, r.status, t.slice(0, 200).replace(/\s+/g, " "));
  } catch (e) {
    console.log(p, "err", e.message);
  }
}
