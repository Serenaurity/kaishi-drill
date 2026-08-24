const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "kaishi_drill.html"), "utf-8");
const scriptSrc = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const tableStart = scriptSrc.indexOf("var KANA_ROMAJI");
const tableEnd = scriptSrc.indexOf("function shuffle");
const funcsStart = scriptSrc.indexOf("function normalizeKanaScript");
const funcsEnd = scriptSrc.indexOf("var state = {");

const tableSrc = scriptSrc.slice(tableStart, tableEnd);
const funcsSrc = scriptSrc.slice(funcsStart, funcsEnd);

eval(tableSrc + "\n" + funcsSrc);

console.log("がっこう (sokuon, expect gakkou):", kanaToRomajiVariants("がっこう"));
console.log("きって (sokuon, expect kitte):", kanaToRomajiVariants("きって"));
console.log("コーヒー (choon, katakana, expect koohii-ish):", kanaToRomajiVariants("コーヒー"));
console.log("ざっし (sokuon, expect zasshi/zassi):", kanaToRomajiVariants("ざっし"));
console.log("ガッコウ (katakana sokuon normalize check):", kanaToRomajiVariants("ガッコウ"));
