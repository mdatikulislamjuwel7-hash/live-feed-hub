const t = await (await fetch("https://paidcash.co/static/js/main.0ee1d1a4.js")).text();
for (const n of ["CQ=", "CQ =", "window.CQ", "globalThis.CQ", "const CQ", "var CQ"]) {
  const i = t.indexOf(n);
  console.log(n, i >= 0 ? t.slice(i, i + 120) : "no");
}
