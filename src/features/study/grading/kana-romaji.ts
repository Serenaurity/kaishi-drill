const ROMAJI: ReadonlyArray<readonly [string, string]> = [
  ["kya", "きゃ"], ["kyu", "きゅ"], ["kyo", "きょ"],
  ["gya", "ぎゃ"], ["gyu", "ぎゅ"], ["gyo", "ぎょ"],
  ["sha", "しゃ"], ["shu", "しゅ"], ["sho", "しょ"],
  ["sya", "しゃ"], ["syu", "しゅ"], ["syo", "しょ"],
  ["ja", "じゃ"], ["ju", "じゅ"], ["jo", "じょ"],
  ["jya", "じゃ"], ["jyu", "じゅ"], ["jyo", "じょ"],
  ["zya", "じゃ"], ["zyu", "じゅ"], ["zyo", "じょ"],
  ["cha", "ちゃ"], ["chu", "ちゅ"], ["cho", "ちょ"],
  ["cya", "ちゃ"], ["cyu", "ちゅ"], ["cyo", "ちょ"],
  ["tya", "ちゃ"], ["tyu", "ちゅ"], ["tyo", "ちょ"],
  ["nya", "にゃ"], ["nyu", "にゅ"], ["nyo", "にょ"],
  ["hya", "ひゃ"], ["hyu", "ひゅ"], ["hyo", "ひょ"],
  ["bya", "びゃ"], ["byu", "びゅ"], ["byo", "びょ"],
  ["pya", "ぴゃ"], ["pyu", "ぴゅ"], ["pyo", "ぴょ"],
  ["mya", "みゃ"], ["myu", "みゅ"], ["myo", "みょ"],
  ["rya", "りゃ"], ["ryu", "りゅ"], ["ryo", "りょ"],
  ["fa", "ふぁ"], ["fi", "ふぃ"], ["fe", "ふぇ"], ["fo", "ふぉ"],
  ["va", "ゔぁ"], ["vi", "ゔぃ"], ["vu", "ゔ"], ["ve", "ゔぇ"], ["vo", "ゔぉ"],
  ["shi", "し"], ["chi", "ち"], ["tsu", "つ"], ["dzu", "づ"],
  ["ka", "か"], ["ki", "き"], ["ku", "く"], ["ke", "け"], ["ko", "こ"],
  ["ga", "が"], ["gi", "ぎ"], ["gu", "ぐ"], ["ge", "げ"], ["go", "ご"],
  ["sa", "さ"], ["si", "し"], ["su", "す"], ["se", "せ"], ["so", "そ"],
  ["za", "ざ"], ["zi", "じ"], ["zu", "ず"], ["ze", "ぜ"], ["zo", "ぞ"],
  ["ta", "た"], ["ti", "ち"], ["tu", "つ"], ["te", "て"], ["to", "と"],
  ["da", "だ"], ["di", "ぢ"], ["du", "づ"], ["de", "で"], ["do", "ど"],
  ["na", "な"], ["ni", "に"], ["nu", "ぬ"], ["ne", "ね"], ["no", "の"],
  ["ha", "は"], ["hi", "ひ"], ["fu", "ふ"], ["hu", "ふ"], ["he", "へ"], ["ho", "ほ"],
  ["ba", "ば"], ["bi", "び"], ["bu", "ぶ"], ["be", "べ"], ["bo", "ぼ"],
  ["pa", "ぱ"], ["pi", "ぴ"], ["pu", "ぷ"], ["pe", "ぺ"], ["po", "ぽ"],
  ["ma", "ま"], ["mi", "み"], ["mu", "む"], ["me", "め"], ["mo", "も"],
  ["ya", "や"], ["yu", "ゆ"], ["yo", "よ"],
  ["ra", "ら"], ["ri", "り"], ["ru", "る"], ["re", "れ"], ["ro", "ろ"],
  ["wa", "わ"], ["wi", "うぃ"], ["we", "うぇ"], ["wo", "を"],
  ["a", "あ"], ["i", "い"], ["u", "う"], ["e", "え"], ["o", "お"],
];

const VOWEL_BY_KANA: Record<string, string> = {};
for (const [romaji, kana] of ROMAJI) {
  const vowel = [...romaji].reverse().find((character) => "aiueo".includes(character));
  if (vowel) VOWEL_BY_KANA[[...kana].at(-1)!] = vowel;
}
Object.assign(VOWEL_BY_KANA, { "ゃ": "a", "ゅ": "u", "ょ": "o", "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o" });

function katakanaToHiragana(value: string): string {
  return [...value].map((character) => {
    const code = character.codePointAt(0)!;
    return code >= 0x30a1 && code <= 0x30f6
      ? String.fromCodePoint(code - 0x60)
      : character;
  }).join("");
}

function expandLongVowels(value: string): string {
  let result = "";
  for (const character of value) {
    if (character !== "ー") {
      result += character;
      continue;
    }
    const vowel = VOWEL_BY_KANA[[...result].at(-1) ?? ""];
    result += vowel === "a" ? "あ" : vowel === "i" ? "い" : vowel === "u" ? "う" : vowel === "e" ? "え" : vowel === "o" ? "う" : "ー";
  }
  return result;
}

export function romajiToHiragana(value: string): string {
  let input = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[āâ]/g, "aa")
    .replace(/[īî]/g, "ii")
    .replace(/[ūû]/g, "uu")
    .replace(/[ēê]/g, "ee")
    .replace(/[ōô]/g, "ou")
    .replace(/n['’]/g, "ん")
    .replace(/[\s._-]+/g, "");
  let result = "";
  while (input.length > 0) {
    if (input[0] === "ん") {
      result += "ん";
      input = input.slice(1);
      continue;
    }
    const doubled = input.match(/^([bcdfghjklmpqrstvwxyz])\1/);
    if (doubled && doubled[1] !== "n") {
      result += "っ";
      input = input.slice(1);
      continue;
    }
    if (input[0] === "n") {
      const next = input[1];
      const previous = value.normalize("NFKC").toLowerCase()[value.length - input.length - 1];
      if (!next || next === "n" || (!"aiueo".includes(next) && next !== "y") || (next === "y" && previous && "aiueo".includes(previous))) {
        result += "ん";
        input = input.slice(next === "n" ? 1 : 1);
        continue;
      }
    }
    const matched = ROMAJI.find(([romaji]) => input.startsWith(romaji));
    if (matched) {
      result += matched[1];
      input = input.slice(matched[0].length);
      continue;
    }
    result += input[0];
    input = input.slice(1);
  }
  return result;
}

export function normalizeReading(value: string): string {
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  const kana = /[a-zāīūēōâîûêô]/i.test(normalized)
    ? romajiToHiragana(normalized)
    : normalized;
  return expandLongVowels(katakanaToHiragana(kana))
    .replace(/[\s・･,，、/／;；|]+/g, "");
}

export function damerauLevenshtein(left: string, right: string): number {
  const a = [...left];
  const b = [...right];
  const matrix = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let index = 0; index <= a.length; index += 1) matrix[index]![0] = index;
  for (let index = 0; index <= b.length; index += 1) matrix[0]![index] = index;
  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      matrix[row]![column] = Math.min(
        matrix[row - 1]![column]! + 1,
        matrix[row]![column - 1]! + 1,
        matrix[row - 1]![column - 1]! + cost,
      );
      if (row > 1 && column > 1 && a[row - 1] === b[column - 2] && a[row - 2] === b[column - 1]) {
        matrix[row]![column] = Math.min(matrix[row]![column]!, matrix[row - 2]![column - 2]! + 1);
      }
    }
  }
  return matrix[a.length]![b.length]!;
}
