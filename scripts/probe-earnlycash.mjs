import * as cheerio from "cheerio";
import { writeFileSync } from "fs";

const eh = await (await fetch("https://earnlycash.com/", { headers: { "User-Agent": "Mozilla/5.0" } })).text();
writeFileSync("tmp-earnlycash.html", eh);
const $ = cheerio.load(eh);
const slide = $(".swiper-slide").first();
console.log("slide html sample", slide.html()?.slice(0, 800));
console.log("slide text", slide.text().replace(/\s+/g, " ").trim().slice(0, 200));

const rh = await (await fetch("https://rubcashly.com/", { headers: { "User-Agent": "Mozilla/5.0" } })).text();
writeFileSync("tmp-rubcashly.html", rh.slice(0, 50000));

// jokercash flutter
const jb = await (await fetch("https://joker-cash.com/flutter_bootstrap.js", { headers: { "User-Agent": "Mozilla/5.0" } })).text();
console.log("flutter bootstrap", jb.slice(0, 400));
const mainDart = jb.match(/main\.dart\.js[^\"']*/)?.[0];
console.log("dart", mainDart);
