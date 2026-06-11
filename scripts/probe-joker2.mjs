const t = await (
  await fetch("https://joker-cash.com/main.dart.js", { headers: { "User-Agent": "Mozilla/5.0" } })
).text();

const patterns = [
  /recent[A-Za-z]*/g,
  /live[A-Za-z]*/g,
  /collection\("([^"]+)"/g,
  /firestore[^\"']{0,80}/gi,
  /projectId[^\"']{0,60}/gi,
];

for (const p of patterns) {
  const matches = [...t.matchAll(p)].slice(0, 8);
  if (matches.length) console.log(String(p), matches.map((m) => m[0] || m[1]));
}

// search for apiKey / project
const apiKey = t.match(/AIza[0-9A-Za-z_-]{30,}/)?.[0];
const project = t.match(/projectId[:\"=]+([a-z0-9-]+)/i)?.[1];
console.log("apiKey", apiKey?.slice(0, 20));
console.log("project", project);
