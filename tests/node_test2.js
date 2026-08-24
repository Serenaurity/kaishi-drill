const fs = require("fs");
const path = require("path");

const htmlPath = path.join(__dirname, "..", "kaishi_drill.html");
const html = fs.readFileSync(htmlPath, "utf-8");
const scriptSrc = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeEl(id) {
  let classes = new Set();
  const listeners = {};
  return {
    id, value: "", disabled: false, textContent: "", innerHTML: "", dataset: {},
    addEventListener(type, fn) { listeners[type] = fn; },
    fire(type, evt) { listeners[type] && listeners[type](evt || { preventDefault(){} }); },
    focus() {}, play() {},
    get className() { return Array.from(classes).join(" "); },
    set className(v) { classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c)
    }
  };
}

const ids = ["statScore","statAccuracy","promptLabel","promptJp","promptHint","playAudioBtn",
  "audioPlayer","answerForm","answerInput","submitBtn","feedback","feedbackStatus","feedbackRef",
  "feedbackGloss","nextRow","nextBtn","heatmapGrid","heatmapMonths","activityStats"];
const elMap = {};
ids.forEach(id => elMap[id] = makeEl(id));

const modeReading = makeEl("m1"); modeReading.dataset.mode = "reading"; modeReading.classList.add("active");
const modeTranslate = makeEl("m2"); modeTranslate.dataset.mode = "translate";
const modeKana = makeEl("m3"); modeKana.dataset.mode = "kana";
const modeBtns = [modeReading, modeTranslate, modeKana];

const document = {
  getElementById: (id) => { if (elMap[id]) return elMap[id]; throw new Error("unstubbed id " + id); },
  querySelectorAll: (sel) => { if (sel === "nav.modes button") return modeBtns; throw new Error("unstubbed " + sel); }
};

// in-memory localStorage stub
const store = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};

const fn = new Function("document", "Math", "console", "localStorage", "Date", scriptSrc);
fn(document, Math, console, localStorage, Date);

console.log("=== KANA MODE ===");
modeKana.fire("click");
console.log("mode label after switch:", elMap.promptLabel.textContent);

let kanaAttempts = 0, kanaPass = 0;
const known = { "あ":"a","か":"ka","し":"shi","つ":"tsu","ん":"n","を":"wo","きゃ":"kya","じょ":"jo" };
for (let i = 0; i < 60; i++) {
  const glyph = elMap.promptJp.textContent;
  // reverse map: find if glyph (hira or kata) corresponds to a known base
  let matched = null;
  for (const base in known) {
    if (glyph === base) { matched = known[base]; break; }
  }
  kanaAttempts++;
  if (matched) {
    elMap.answerInput.value = matched;
    elMap.answerForm.fire("submit");
    if (elMap.feedbackStatus.textContent === "Correct") kanaPass++;
    else console.log("  KANA MISS:", glyph, "guessed", matched);
  } else {
    elMap.answerInput.value = "zz";
    elMap.answerForm.fire("submit");
  }
  elMap.nextBtn.fire("click");
}
console.log(`Known hiragana romaji checks passed (out of attempts where a known base matched)`);
console.log("kana score after loop:", elMap.statScore.textContent);

// explicit katakana check: force via manual small loop searching for katakana ones
let foundKata = false;
for (let i = 0; i < 60 && !foundKata; i++) {
  const glyph = elMap.promptJp.textContent;
  const label = elMap.promptLabel.textContent;
  if (label.indexOf("KATAKANA") !== -1) {
    // try common ones
    const guesses = { "ア":"a","カ":"ka","シ":"shi","ツ":"tsu","ン":"n","ヲ":"wo","キャ":"kya","ジョ":"jo" };
    const g = guesses[glyph];
    if (g) {
      elMap.answerInput.value = g;
      elMap.answerForm.fire("submit");
      console.log("Katakana test", glyph, "->", elMap.feedbackStatus.textContent);
      foundKata = true;
      break;
    }
  }
  elMap.nextBtn.fire("click");
}

console.log("\n=== ACTIVITY TRACKING ===");
console.log("localStorage after kana answers:", JSON.parse(localStorage.getItem("kaishiDrillActivity_v1")));
console.log("activityStats html:", elMap.activityStats.innerHTML);
console.log("heatmapGrid has content:", elMap.heatmapGrid.innerHTML.length > 100);
console.log("heatmapMonths has content:", elMap.heatmapMonths.innerHTML.length > 10);

console.log("\n=== REGRESSION: reading + translate still work ===");
modeReading.fire("click");
console.log("mode after switch to reading:", elMap.promptLabel.textContent, elMap.statScore.textContent);
modeTranslate.fire("click");
elMap.answerInput.value = "some unrelated wrong text";
elMap.answerForm.fire("submit");
console.log("translate wrong-answer status:", elMap.feedbackStatus.textContent);

console.log("\nfinal activity total reps:", JSON.parse(localStorage.getItem("kaishiDrillActivity_v1"))[Object.keys(JSON.parse(localStorage.getItem("kaishiDrillActivity_v1")))[0]]);
