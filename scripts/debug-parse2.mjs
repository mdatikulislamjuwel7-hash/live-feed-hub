import * as cheerio from "cheerio";

function decodeAttr(value = "") {
  return String(value).replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

const url = "https://earng.net/earn";
const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
const html = await res.text();
const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
const $ = cheerio.load(html);
const csrf = $('meta[name="csrf-token"]').attr("content") || "";
const el = $("[wire\\:snapshot]").toArray().find((e) =>
  decodeAttr($(e).attr("wire:snapshot") || "").includes("user.widget.live-lead")
);
let snapshot = decodeAttr($(el).attr("wire:snapshot") || "");
const lazy = decodeAttr($(el).attr("x-intersect") || "").match(/__lazyLoad\('([^']+)/)?.[1];
const xsrf = cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1];
const token = xsrf ? decodeURIComponent(xsrf) : csrf;

async function call(calls) {
  const lw = await fetch("https://earng.net/livewire/update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-TOKEN": csrf,
      "X-XSRF-TOKEN": token,
      Cookie: cookie,
      Origin: "https://earng.net",
      Referer: url,
    },
    body: JSON.stringify({
      _token: csrf,
      components: [{ snapshot, updates: {}, calls }],
    }),
  });
  const json = await lw.json();
  snapshot = json.components[0].snapshot;
  return json;
}

await call([{ path: "", method: "__lazyLoad", params: [lazy] }]);
await call([{ path: "", method: "refreshLiveLeAD", params: [] }]);
const snap = JSON.parse(decodeAttr(snapshot));
console.log(JSON.stringify(snap.data.liveLeads, null, 2).slice(0, 800));

function parseTooltip(html, labels) {
  const $ = cheerio.load(String(html || ""));
  const text = $("body").text().replace(/\s+/g, " ").trim();
  console.log("tooltip text", text);
  const out = {};
  for (const label of labels) {
    const re = new RegExp(`${label}:\\s*(.*?)(?=\\s+(?:${labels.join("|")}):|$)`, "i");
    out[label] = text.match(re)?.[1]?.trim() || "";
  }
  return out;
}

const title = "<div class='text-start text-body'><p class='m-0'>Username: CunningCobra</h6> <p class='m-0'>Name: Upwall - SlotsWise_install (130700)</p> <p class='m-0'>Amount: 455 Points</p> </div>";
console.log(parseTooltip(title, ["Username", "Name", "Amount"]));
