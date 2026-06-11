import { writeFileSync } from "fs";

for (const [name, url] of [
  ["jj-earn", "https://jjreward.com/earn"],
  ["hogo-earn", "https://hogocash.com/earn"],
]) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const t = await r.text();
  writeFileSync(`tmp-${name}.html`, t);
  for (const k of [
    "live-cashout",
    "live-lead",
    "livewire",
    "Live Cashout",
    "Live Leads",
    "cashout_item",
    "user.widget",
  ]) {
    console.log(name, k, t.includes(k));
  }
}
