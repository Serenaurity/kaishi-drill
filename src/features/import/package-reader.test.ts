import { describe, expect, it } from "vitest";
import {
  buildMediaManifest,
  buildModernPackage,
  compressFixture,
} from "../../../tests/fixtures/build-modern-package";
import { PACKAGE_LIMITS } from "./limits";
import { readPackage } from "./package-reader";
import { decodeMediaEntries } from "./protobuf";
import { decompressIfZstd } from "./zstd";

describe("modern Anki package reader", () => {
  it("reads v3 media names and ignores the dummy legacy collection", async () => {
    const blob = await buildModernPackage({
      collectionBytes: new Uint8Array([1, 2, 3]),
      includeDummyCollection: true,
      media: [
        {
          name: "語.webp",
          bytes: new Uint8Array([4, 5]),
          sha1: new Uint8Array(20),
        },
      ],
    });
    const packageReader = await readPackage(blob);
    try {
      expect(packageReader.version).toBe(3);
      expect(await packageReader.listMedia()).toEqual([
        expect.objectContaining({ zipEntry: "0", filename: "語.webp", byteLength: 2 }),
      ]);
      expect(await packageReader.readCollection()).toEqual(new Uint8Array([1, 2, 3]));
    } finally {
      await packageReader.close();
    }
  });

  it("uses a multi-byte legacy archive index when the manifest provides one", async () => {
    const blob = await buildModernPackage({
      collectionBytes: new Uint8Array(),
      media: [
        {
          name: "audio.mp3",
          bytes: new Uint8Array([1]),
          sha1: new Uint8Array(20),
          legacyZipEntry: 300,
        },
      ],
    });
    const packageReader = await readPackage(blob);
    try {
      expect((await packageReader.listMedia())[0]?.zipEntry).toBe("300");
    } finally {
      await packageReader.close();
    }
  });

  it("rejects unsafe traversal filenames", async () => {
    const blob = await buildModernPackage({
      collectionBytes: new Uint8Array(),
      media: [
        { name: "../bad.mp3", bytes: new Uint8Array(), sha1: new Uint8Array(20) },
      ],
    });
    await expect(readPackage(blob)).rejects.toThrow(/unsafe media filename/i);
  });

  it("requires collection.anki21b for a modern v3 package", async () => {
    const blob = await buildModernPackage({
      collectionBytes: new Uint8Array([1, 2, 3]),
      collectionEntryName: "collection.anki2",
      media: [],
    });
    await expect(readPackage(blob)).rejects.toThrow(/collection\.anki21b/i);
  });

  it("rejects a pre-aborted import", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(readPackage(new Blob(), controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("rejects malformed protobuf wire types and truncated varints", () => {
    expect(() => decodeMediaEntries(new Uint8Array([0x0f]))).toThrow(/wire type/i);
    expect(() => decodeMediaEntries(new Uint8Array([0x0a, 0x80]))).toThrow(/truncated/i);
  });

  it("stops zstd output at the caller's declared limit", async () => {
    const compressed = await compressFixture(new Uint8Array(512));
    expect(() => decompressIfZstd(compressed, 32)).toThrow(/exceeds limit/i);
  });

  it("rejects a manifest whose declared media total exceeds the package limit", async () => {
    const media = Array.from({ length: 33 }, (_, index) => ({
      name: `${index}.mp3`,
      bytes: new Uint8Array(),
      declaredByteLength: PACKAGE_LIMITS.mediaBytesEach,
      sha1: new Uint8Array(20).fill(index),
    }));
    expect(decodeMediaEntries(buildMediaManifest(media))).toHaveLength(33);
    const blob = await buildModernPackage({ collectionBytes: new Uint8Array(), media });
    await expect(readPackage(blob)).rejects.toThrow(/total size limit/i);
  });
});
