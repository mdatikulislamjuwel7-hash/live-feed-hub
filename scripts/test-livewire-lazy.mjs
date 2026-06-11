import * as cheerio from "cheerio";

function decodeAttr(value = "") {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'");
}

async function livewireLazy(source, componentMatch) {
  const url = String(source.url);
  const origin = new URL(url).origin;
  const res = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent": "Mozilla/5.0 Chrome/120",
    },
    signal: AbortSignal.timeout(25000),
  });
  const html = await res.text();
  const cookie = (res.headers.getSetCookie?.() || [])
    .map((c) => c.split(";")[0])
    .join("; ");
  const $ = cheerio.load(html);
  const csrf = $('meta[name="csrf-token"]').attr("content") || "";
  const components = $("[wire\\:snapshot]")
    .toArray()
    .map((el) => ({
      snapshot: $(el).attr("wire:snapshot") || "",
      intersect: $(el).attr("x-intersect") || "",
      html: $.html(el),
    }))
    .filter((c) => decodeAttr(c.snapshot).includes(componentMatch));

  console.log("found", components.length, "for", componentMatch);
  if (!components.length) return { html: "", pageHtml: html };

  const comp = components[0];
  const snapshot = decodeAttr(comp.snapshot);
  const lazyPayload = decodeAttr(comp.intersect).match(/__lazyLoad\('([^']+)/)?.[1];

  if (!lazyPayload) {
    return { html: comp.html, pageHtml: html };
  }

  const xsrf = cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1];
  const token = xsrf ? decodeURIComponent(xsrf) : csrf;
  const lw = await fetch(`${origin}/livewire/update`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-TOKEN": csrf,
      "X-XSRF-TOKEN": token,
      Cookie: cookie,
      Origin: origin,
      Referer: url,
      "User-Agent": "Mozilla/5.0 Chrome/120",
    },
    body: JSON.stringify({
      _token: csrf,
      components: [
        {
          snapshot,
          updates: {},
          calls: [{ path: "", method: "__lazyLoad", params: [lazyPayload] }],
        },
      ],
    }),
  });
  const json = await lw.json();
  return {
    html: json?.components?.[0]?.effects?.html || "",
    pageHtml: html,
  };
}

for (const [name, url, match] of [
  ["earng", "https://earng.net/earn", "user.widget.live-lead"],
  ["gaincash", "https://gaincash.me/", "live-cashout-list"],
  ["cointo", "https://cointo.co/earn", "user.widget.live-lead"],
]) {
  const { html, pageHtml } = await livewireLazy({ url }, match);
  const $ = cheerio.load(html || pageHtml);
  console.log("\n", name, "lw html len", html.length, "cashout_item", $(".cashout_item").length, "lead", $("[class*='lead']").length);
  if (html) {
    const snippet = html.replace(/\s+/g, " ").slice(0, 400);
    console.log("snippet:", snippet);
  }
}
