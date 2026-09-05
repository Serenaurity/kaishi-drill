import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";

type ModernPackageModule = typeof import("./build-modern-package.ts");
type CollectionModule = typeof import("./synthetic-collection.ts");

const modernPackageImport = (await import("./build-modern-package.ts")) as ModernPackageModule & {
  default?: ModernPackageModule;
};
const collectionImport = (await import("./synthetic-collection.ts")) as CollectionModule & {
  default?: CollectionModule;
};
const buildModernPackage =
  modernPackageImport.buildModernPackage ?? modernPackageImport.default?.buildModernPackage;
const buildSyntheticCollection =
  collectionImport.buildSyntheticCollection ?? collectionImport.default?.buildSyntheticCollection;
if (!buildModernPackage || !buildSyntheticCollection) {
  throw new Error("Synthetic fixture builders could not be loaded");
}

async function sha1(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-1", bytes.slice().buffer));
}

const SQL = await initSqlJs({
  locateFile: () =>
    fileURLToPath(new URL("../../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url)),
});
const wordImage = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);
const wordAudio = new Uint8Array([0x49, 0x44, 0x33, 1]);
const sentenceAudio = new Uint8Array([0x49, 0x44, 0x33, 2]);
const packageBlob = await buildModernPackage({
  collectionBytes: buildSyntheticCollection(SQL),
  media: [
    { name: "word.webp", bytes: wordImage, sha1: await sha1(wordImage) },
    { name: "word.mp3", bytes: wordAudio, sha1: await sha1(wordAudio) },
    { name: "sentence.mp3", bytes: sentenceAudio, sha1: await sha1(sentenceAudio) },
  ],
});

await mkdir("test-results/fixtures", { recursive: true });
await writeFile(
  "test-results/fixtures/synthetic-kaishi.apkg",
  new Uint8Array(await packageBlob.arrayBuffer()),
);
