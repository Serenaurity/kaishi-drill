export interface KanaEntry {
  id: string;
  script: "hiragana" | "katakana";
  group: "basic" | "dakuten" | "handakuten" | "yoon";
  kana: string;
  romaji: readonly string[];
  strokeCodePoint: string;
}

type CatalogRow = readonly [kana: string, romaji: readonly string[]];

const BASIC: readonly CatalogRow[] = [
  ["あ", ["a"]], ["い", ["i"]], ["う", ["u"]], ["え", ["e"]], ["お", ["o"]],
  ["か", ["ka"]], ["き", ["ki"]], ["く", ["ku"]], ["け", ["ke"]], ["こ", ["ko"]],
  ["さ", ["sa"]], ["し", ["shi", "si"]], ["す", ["su"]], ["せ", ["se"]], ["そ", ["so"]],
  ["た", ["ta"]], ["ち", ["chi", "ti"]], ["つ", ["tsu", "tu"]], ["て", ["te"]], ["と", ["to"]],
  ["な", ["na"]], ["に", ["ni"]], ["ぬ", ["nu"]], ["ね", ["ne"]], ["の", ["no"]],
  ["は", ["ha"]], ["ひ", ["hi"]], ["ふ", ["fu", "hu"]], ["へ", ["he"]], ["ほ", ["ho"]],
  ["ま", ["ma"]], ["み", ["mi"]], ["む", ["mu"]], ["め", ["me"]], ["も", ["mo"]],
  ["や", ["ya"]], ["ゆ", ["yu"]], ["よ", ["yo"]],
  ["ら", ["ra"]], ["り", ["ri"]], ["る", ["ru"]], ["れ", ["re"]], ["ろ", ["ro"]],
  ["わ", ["wa"]], ["を", ["wo", "o"]], ["ん", ["n", "n'"]],
];

const DAKUTEN: readonly CatalogRow[] = [
  ["が", ["ga"]], ["ぎ", ["gi"]], ["ぐ", ["gu"]], ["げ", ["ge"]], ["ご", ["go"]],
  ["ざ", ["za"]], ["じ", ["ji", "zi"]], ["ず", ["zu"]], ["ぜ", ["ze"]], ["ぞ", ["zo"]],
  ["だ", ["da"]], ["ぢ", ["ji", "di", "dji"]], ["づ", ["zu", "du", "dzu"]], ["で", ["de"]], ["ど", ["do"]],
  ["ば", ["ba"]], ["び", ["bi"]], ["ぶ", ["bu"]], ["べ", ["be"]], ["ぼ", ["bo"]],
];

const HANDAKUTEN: readonly CatalogRow[] = [
  ["ぱ", ["pa"]], ["ぴ", ["pi"]], ["ぷ", ["pu"]], ["ぺ", ["pe"]], ["ぽ", ["po"]],
];

const YOON: readonly CatalogRow[] = [
  ["きゃ", ["kya"]], ["きゅ", ["kyu"]], ["きょ", ["kyo"]],
  ["ぎゃ", ["gya"]], ["ぎゅ", ["gyu"]], ["ぎょ", ["gyo"]],
  ["しゃ", ["sha", "sya"]], ["しゅ", ["shu", "syu"]], ["しょ", ["sho", "syo"]],
  ["じゃ", ["ja", "jya", "zya"]], ["じゅ", ["ju", "jyu", "zyu"]], ["じょ", ["jo", "jyo", "zyo"]],
  ["ちゃ", ["cha", "tya", "cya"]], ["ちゅ", ["chu", "tyu", "cyu"]], ["ちょ", ["cho", "tyo", "cyo"]],
  ["ぢゃ", ["ja", "dya"]], ["ぢゅ", ["ju", "dyu"]], ["ぢょ", ["jo", "dyo"]],
  ["にゃ", ["nya"]], ["にゅ", ["nyu"]], ["にょ", ["nyo"]],
  ["ひゃ", ["hya"]], ["ひゅ", ["hyu"]], ["ひょ", ["hyo"]],
  ["びゃ", ["bya"]], ["びゅ", ["byu"]], ["びょ", ["byo"]],
  ["ぴゃ", ["pya"]], ["ぴゅ", ["pyu"]], ["ぴょ", ["pyo"]],
  ["みゃ", ["mya"]], ["みゅ", ["myu"]], ["みょ", ["myo"]],
  ["りゃ", ["rya"]], ["りゅ", ["ryu"]], ["りょ", ["ryo"]],
];

function toKatakana(value: string): string {
  return [...value].map((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint >= 0x3041 && codePoint <= 0x3096
      ? String.fromCodePoint(codePoint + 0x60)
      : character;
  }).join("");
}

function strokeCodePoints(value: string): string {
  return [...value]
    .map((character) => character.codePointAt(0)!.toString(16).padStart(5, "0"))
    .join(",");
}

function entries(
  group: KanaEntry["group"],
  rows: readonly CatalogRow[],
): KanaEntry[] {
  return (["hiragana", "katakana"] as const).flatMap((script) => rows.map(([source, romaji]) => {
    const kana = script === "hiragana" ? source : toKatakana(source);
    return {
      id: `${script}:${kana}`,
      script,
      group,
      kana,
      romaji,
      strokeCodePoint: strokeCodePoints(kana),
    };
  }));
}

export const KANA_CATALOG: readonly KanaEntry[] = Object.freeze([
  ...entries("basic", BASIC),
  ...entries("dakuten", DAKUTEN),
  ...entries("handakuten", HANDAKUTEN),
  ...entries("yoon", YOON),
]);
