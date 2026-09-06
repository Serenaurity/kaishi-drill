import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js";

const RELEASE = "r20250816";
const ARCHIVE_NAME = "kanjivg-20250816-main.zip";
const SOURCE_URL = `https://github.com/KanjiVG/kanjivg/releases/download/${RELEASE}/${ARCHIVE_NAME}`;
const EXPECTED_SHA256 = "69a2944ec1183086fdee5ba9c1f48bc306b867480a95b2f337f3203bf50689a3";
const HIRAGANA = [...new Set([...(
  "あいうえおかきくけこさしすせそたちつてとなにぬねの" +
  "はひふへほまみむめもやゆよらりるれろわをん" +
  "がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゃゅょ"
)])];

function toKatakana(character) {
  const codePoint = character.codePointAt(0);
  return String.fromCodePoint(codePoint >= 0x3041 && codePoint <= 0x3096 ? codePoint + 0x60 : codePoint);
}

function filename(character) {
  return `${character.codePointAt(0).toString(16).padStart(5, "0")}.svg`;
}

function sanitizeSvg(source, sourceName) {
  if (!source.includes("<svg") || /<script\b/i.test(source) || /\son\w+\s*=/i.test(source)) {
    throw new Error(`Unsafe SVG content in ${sourceName}`);
  }
  if (/<(?:image|use)\b[^>]+(?:href|xlink:href)\s*=\s*["'](?:https?:|\/\/)/i.test(source)) {
    throw new Error(`External SVG reference in ${sourceName}`);
  }
  const start = source.search(/<svg\b/i);
  const end = source.toLowerCase().lastIndexOf("</svg>");
  if (start < 0 || end < start) throw new Error(`Malformed SVG content in ${sourceName}`);
  const sanitized = source
    .slice(start, end + "</svg>".length)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+(?:xmlns:)?kvg:[\w-]+\s*=\s*(?:"[^"]*"|'[^']*')/g, "")
    .replace(/>\s+</g, "><")
    .trim();
  if (!/^<svg\b/i.test(sanitized) || /<\?|<!/i.test(sanitized) || /<\/?kvg:|\s+(?:xmlns:)?kvg:/i.test(sanitized)) {
    throw new Error(`Unsafe XML declaration in ${sourceName}`);
  }
  return sanitized;
}

async function loadArchive() {
  const archiveFlag = process.argv.indexOf("--archive");
  if (archiveFlag >= 0) {
    const value = process.argv[archiveFlag + 1];
    if (!value) throw new Error("--archive requires a path");
    return readFile(resolve(value));
  }
  const response = await fetch(SOURCE_URL, { redirect: "follow" });
  if (!response.ok) throw new Error(`KanjiVG download failed with HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const archive = await loadArchive();
const digest = createHash("sha256").update(archive).digest("hex");
if (digest !== EXPECTED_SHA256) {
  throw new Error(`KanjiVG checksum mismatch: expected ${EXPECTED_SHA256}, received ${digest}`);
}

const targets = [...HIRAGANA, ...HIRAGANA.map(toKatakana)];
const names = new Set(targets.map(filename));
const outputDirectory = resolve("public", "kana-strokes");
await mkdir(outputDirectory, { recursive: true });

const reader = new ZipReader(new BlobReader(new Blob([archive])));
try {
  const entries = await reader.getEntries();
  const selected = entries.filter((entry) => names.has(entry.filename.split("/").at(-1)));
  const found = new Set();
  for (const entry of selected) {
    if (entry.directory || !entry.getData) continue;
    const name = entry.filename.split("/").at(-1);
    if (!name || found.has(name)) throw new Error(`Duplicate KanjiVG asset ${name}`);
    const source = await entry.getData(new TextWriter());
    await writeFile(resolve(outputDirectory, name), `${sanitizeSvg(source, entry.filename)}\n`, "utf8");
    found.add(name);
  }
  const missing = [...names].filter((name) => !found.has(name));
  if (missing.length > 0) throw new Error(`KanjiVG archive is missing: ${missing.join(", ")}`);
  process.stdout.write(`Verified ${RELEASE} (${digest}) and wrote ${found.size} Kana SVG files.\n`);
} finally {
  await reader.close();
}
