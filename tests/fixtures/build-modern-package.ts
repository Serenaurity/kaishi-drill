import { compress, init } from "@bokuweb/zstd-wasm";
import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";

export interface SyntheticMediaInput {
  name: string;
  bytes: Uint8Array;
  sha1: Uint8Array;
  declaredByteLength?: number;
  legacyZipEntry?: number;
}

export interface SyntheticPackageInput {
  collectionBytes: Uint8Array;
  media: SyntheticMediaInput[];
  collectionEntryName?: "collection.anki21b" | "collection.anki2";
  includeDummyCollection?: boolean;
}

let zstdReady: Promise<void> | undefined;

export async function compressFixture(bytes: Uint8Array): Promise<Uint8Array> {
  zstdReady ??= init();
  await zstdReady;
  return compress(bytes).slice();
}

function concatenate(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const value = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    value.set(part, offset);
    offset += part.byteLength;
  }
  return value;
}

function encodeVarint(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Fixture varint must be a non-negative safe integer");
  }
  const output: number[] = [];
  let remaining = value;
  do {
    const byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    output.push(byte | (remaining > 0 ? 0x80 : 0));
  } while (remaining > 0);
  return new Uint8Array(output);
}

function varintField(field: number, value: number): Uint8Array {
  return concatenate([encodeVarint(field * 8), encodeVarint(value)]);
}

function bytesField(field: number, value: Uint8Array): Uint8Array {
  return concatenate([encodeVarint(field * 8 + 2), encodeVarint(value.byteLength), value]);
}

export function buildMediaManifest(media: SyntheticMediaInput[]): Uint8Array {
  return concatenate(
    media.map((item, index) => {
      const fields = [
        bytesField(1, new TextEncoder().encode(item.name)),
        varintField(2, item.declaredByteLength ?? item.bytes.byteLength),
        bytesField(3, item.sha1),
      ];
      if (item.legacyZipEntry !== undefined) {
        fields.push(varintField(255, item.legacyZipEntry));
      }
      return bytesField(1, concatenate(fields));
    }),
  );
}

export async function buildModernPackage(input: SyntheticPackageInput): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  await writer.add("meta", new Uint8ArrayReader(varintField(1, 3)));

  const collectionName = input.collectionEntryName ?? "collection.anki21b";
  await writer.add(
    collectionName,
    new Uint8ArrayReader(await compressFixture(input.collectionBytes)),
  );
  if (input.includeDummyCollection && collectionName !== "collection.anki2") {
    await writer.add("collection.anki2", new Uint8ArrayReader(new Uint8Array([1, 2, 3])));
  }

  for (let index = 0; index < input.media.length; index += 1) {
    const item = input.media[index]!;
    const archiveIndex = item.legacyZipEntry ?? index;
    await writer.add(
      String(archiveIndex),
      new Uint8ArrayReader(await compressFixture(item.bytes)),
    );
  }

  await writer.add(
    "media",
    new Uint8ArrayReader(await compressFixture(buildMediaManifest(input.media))),
  );
  return writer.close();
}
