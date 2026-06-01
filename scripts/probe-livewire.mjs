import * as cheerio from "cheerio";

const jar = new Map();
function storeCookies(res) {
  const list = res.headers.getSetCookie?.() || [];
  for (const c of list) {
    const [pair] = c.split(";");
    const [k, v] = pair.split("=");
    if (k && v) jar.set(k.trim(), v.trim());
  }
}
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

const home = await fetch("https://apucash.com/", {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html",
  },
});
storeCookies(home);
const html = await home.text();
const $ = cheerio.load(html);
const metaCsrf = $('meta[name="csrf-token"]').attr("content");
const dataCsrf = html.match(/data-csrf="([^"]+)"/)?.[1];
const token = metaCsrf || dataCsrf;
const xsrf = jar.get("XSRF-TOKEN");
const decoded = xsrf ? decodeURIComponent(xsrf) : token;

const snapRaw = $("#last_offers [wire\\:snapshot]").first().attr("wire:snapshot");
const snapshot = snapRaw?.replace(/&quot;/g, '"').replace(/&amp;/g, "&");

console.log("cookies", [...jar.keys()].join(", "));
console.log("csrf meta", !!metaCsrf, "data", !!dataCsrf);

const r = await fetch("https://apucash.com/livewire/update", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-CSRF-TOKEN": decoded,
    "X-XSRF-TOKEN": decoded,
    "X-Livewire": "",
    Cookie: cookieHeader(),
    Referer: "https://apucash.com/",
    Origin: "https://apucash.com",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  },
  body: JSON.stringify({
    _token: decoded,
    components: [{ snapshot, updates: {}, calls: [] }],
  }),
});

console.log("status", r.status);
if (r.ok) {
  const j = await r.json();
  const out = j.components?.[0]?.effects?.html || "";
  const $2 = cheerio.load(out);
  let n = 0;
  $2("[wire\\:key^='offer-']").each((_, el) => {
    const small = $2(el).find("p[style*='10px']").text().trim();
    const h6 = $2(el).find("h6").text().trim();
    if (small) {
      console.log(h6, "->", small);
      n++;
    }
  });
  console.log("with offer text", n);
} else {
  console.log(await r.text());
}
