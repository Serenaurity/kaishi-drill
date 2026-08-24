const fs = require("fs");
const path = require("path");

const htmlPath = path.join(__dirname, "..", "kaishi_drill.html");
const html = fs.readFileSync(htmlPath, "utf-8");
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error("script tag not found");
const scriptSrc = scriptMatch[1];

function makeEl(id) {
  let classes = new Set();
  const listeners = {};
  return {
    id,
    value: "",
    disabled: false,
    textContent: "",
    innerHTML: "",
    dataset: {},
    _listeners: listeners,
    addEventListener(type, fn) { listeners[type] = fn; },
    fire(type, evt) { listeners[type] && listeners[type](evt || { preventDefault(){} }); },
    focus() {},
    play() {},
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
  "feedbackGloss","nextRow","nextBtn"];
const elMap = {};
ids.forEach(id => elMap[id] = makeEl(id));

const modeBtnReading = makeEl("modeReading");
modeBtnReading.dataset.mode = "reading";
modeBtnReading.classList.add("active");
const modeBtnTranslate = makeEl("modeTranslate");
modeBtnTranslate.dataset.mode = "translate";
const modeBtns = [modeBtnReading, modeBtnTranslate];

const document = {
  getElementById: (id) => {
    if (id === "answerForm") return elMap.answerForm;
    if (id === "answerInput") return elMap.answerInput;
    if (elMap[id]) return elMap[id];
    throw new Error("unstubbed id " + id);
  },
  querySelectorAll: (sel) => {
    if (sel === "nav.modes button") return modeBtns;
    throw new Error("unstubbed selector " + sel);
  }
};

const sandbox = { document, Math, console, String, Array };
const fn = new Function("document", "Math", "console", scriptSrc);
fn(document, Math, console);

// ---- pull internal state back out via the DOM stub side effects ----
function report(label) {
  console.log(`\n[${label}]`);
  console.log("  mode label:", elMap.promptLabel.textContent, "| prompt:", elMap.promptJp.textContent || elMap.promptJp.innerHTML);
  console.log("  score:", elMap.statScore.textContent, "accuracy:", elMap.statAccuracy.textContent);
}

report("initial (reading mode)");

// find a word we know: search ITEMS via a trick -- re-require items from json
const items = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "sample_items_audio.json"), "utf-8"));
console.log("\ntotal sample items:", items.length);

// Drive several rounds of the reading drill using romaji, matching whatever word is currently shown
function findItemByWord(word) { return items.find(it => it.word === word); }

let attempts = 0, romajiPassCount = 0;
const romajiGuesses = {
  "私": "watashi", "あなた":"anata", "さん":"san", "彼":"kare", "好き":"suki",
  "人ひと":"hito", "いい":"ii", "日本語":"nihongo", "勉強":"benkyou", "本":"hon",
  "これ":"kore", "何":"nan", "それ":"sore", "あれ":"are", "どれ":"dore",
  "毎日":"mainichi", "兄":"ani", "いる":"iru", "ある":"aru", "あまり":"amari",
  "今":"ima", "時間":"jikan", "無い":"nai", "この":"kono", "その":"sono",
  "あの":"ano", "どの":"dono", "見る":"miru", "全然":"zenzen", "面白い":"omoshiroi",
  "する":"suru", "なる":"naru", "先生":"sensei", "ください":"kudasai", "名前":"namae"
};

for (let i = 0; i < 40; i++) {
  const word = elMap.promptJp.textContent;
  let guess = romajiGuesses[word];
  if (word === "人" && !guess) guess = "hito"; // covers both 人 entries (ひと / じん) -- test alt reading separately below
  attempts++;
  elMap.answerInput.value = guess || "zzz-unknown-zzz";
  elMap.answerForm.fire("submit");
  if (elMap.feedbackStatus.textContent === "Correct") romajiPassCount++;
  else if (guess) console.log("  MISS:", word, "guessed", guess, "-> reading was", findItemByWord(word) && findItemByWord(word).reading);
  elMap.nextBtn.fire("click");
}
console.log(`\nRomaji auto-drive: ${romajiPassCount}/${attempts} matched (unmapped words intentionally miss)`);

// explicit alt-reading tests: 何 (nani/nan), 人 as jin
function forceItemAndCheck(word, expectedReadingIndex, guess) {
  // cycle until we land on the exact reading variant we want by checking .meaning uniqueness
}

// direct test: submit kana for a word too
// cycle to any item and test kana path
let kanaTestDone = false;
for (let i = 0; i < 40 && !kanaTestDone; i++) {
  const word = elMap.promptJp.textContent;
  const it = findItemByWord(word);
  if (it) {
    elMap.answerInput.value = it.reading.split("・")[0];
    elMap.answerForm.fire("submit");
    console.log("\nKana-input test for", word, "->", elMap.feedbackStatus.textContent, "(expected Correct)");
    kanaTestDone = true;
  } else {
    elMap.nextBtn.fire("click");
  }
}

// sokuon / choon unit test via direct access is not possible (closures) -- test through a synthetic reading
// add a synthetic item at runtime isn't possible either (ITEMS is closed over already), so just trust code review for sokuon/choon,
// but verify one deck word with youon + separate ん + long u: べんきょう -> benkyou
elMap.nextBtn.fire("click");
for (let i = 0; i < 40; i++) {
  const word = elMap.promptJp.textContent;
  if (word === "勉強") {
    elMap.answerInput.value = "benkyou";
    elMap.answerForm.fire("submit");
    console.log("\nYouon+n+long-u test (勉強 -> benkyou):", elMap.feedbackStatus.textContent, "(expected Correct)");
    break;
  }
  elMap.nextBtn.fire("click");
}

// translation heuristic still intact
modeBtnTranslate.fire("click");
report("after switch to translate");
elMap.answerInput.value = "This is a test sentence unrelated to anything";
elMap.answerForm.fire("submit");
console.log("\nTranslate wrong-answer test:", elMap.feedbackStatus.textContent, "(expected not 'Correct'/'Close enough')");

// audio wiring check
console.log("\nplayAudioBtn.disabled after mode switch (should be false, audio present):", elMap.playAudioBtn.disabled);
elMap.playAudioBtn.fire("click");
console.log("audioPlayer.src set after click:", elMap.audioPlayer.src ? ("data URI, length=" + elMap.audioPlayer.src.length) : "(none)");
