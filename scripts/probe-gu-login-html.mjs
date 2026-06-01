const t = await (await fetch("https://gamersunivers.com/page/login.html")).text();
console.log("len", t.length);
const scripts = [...t.matchAll(/src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]);
console.log("scripts", scripts);
const inline = t.includes("<script>") || t.includes("<script ");
const forms = t.slice(t.indexOf("<form"), t.indexOf("</form") + 6);
console.log("form snippet", forms.slice(0, 1500));
const liveRefs = [...t.matchAll(/live[^"'\s]*/gi)].map((m) => m[0]).slice(0, 20);
console.log("live refs", liveRefs);
