import {
  BlobReader,
  Uint8ArrayWriter,
  ZipReader,
  type Entry,
} from "@zip.js/zip.js";
import { PACKAGE_LIMITS } from "./limits";
import { decodeMediaEntries, decodePackageMetadata } from "./protobuf";
import type { MediaManifestEntry, PackageReader } from "./types";
import { decompressIfZstd } from "./zstd";

const METADATA_BYTES = 64 * 1024;
const ZIP_OVERHEAD_BYTES = 1024 * 1024;

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Import cancelled", "AbortError");
  }
}

function validateMediaFilename(filename: string): void {
  const pathParts = filename.split("/");
  if (
    filename.length === 0 ||
    filename.includes("\0") ||
    filename.includes("\\") ||
    filename.startsWith("/") ||
    pathParts.some((part) => part === "..") ||
    /^[a-z][a-z0-9+.-]*:/i.test(filename) ||
    Array.from(filename).length > PACKAGE_LIMITS.filenameCodePoints
  ) {
    throw new Error(`Unsafe media filename: ${filename}`);
  }
}

function validateMediaManifest(media: MediaManifestEntry[], entryNames: Set<string>): void {
  const filenames = new Set<string>();
  const zipEntries = new Set<string>();
  let totalBytes = 0;

  for (const entry of media) {
    validateMediaFilename(entry.filename);
    if (filenames.has(entry.filename)) {
      throw new Error(`Duplicate media filename: ${entry.filename}`);
    }
    if (zipEntries.has(entry.zipEntry)) {
      throw new Error(`Duplicate media archive entry: ${entry.zipEntry}`);
    }
    if (!entryNames.has(entry.zipEntry)) {
      throw new Error(`Missing media entry: ${entry.zipEntry}`);
    }
    if (entry.byteLength > PACKAGE_LIMITS.mediaBytesEach) {
      throw new Error(`Media exceeds per-file size limit: ${entry.filename}`);
    }

    totalBytes += entry.byteLength;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > PACKAGE_LIMITS.mediaBytesTotal) {
      throw new Error("Package media exceeds total size limit");
    }

    filenames.add(entry.filename);
    zipEntries.add(entry.zipEntry);
  }
}

async function readZipEntry(
  entry: Entry | undefined,
  name: string,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  abortIfNeeded(signal);
  if (!entry || entry.directory || !entry.getData) {
    throw new Error(`Missing package entry: ${name}`);
  }
  if (entry.uncompressedSize > maxBytes) {
    throw new Error(`Package entry exceeds size limit: ${name}`);
  }

  const value = await entry.getData(new Uint8ArrayWriter());
  abortIfNeeded(signal);
  if (value.byteLength > maxBytes) {
    throw new Error(`Package entry exceeds size limit: ${name}`);
  }
  return value;
}

export async function readPackage(source: Blob, signal?: AbortSignal): Promise<PackageReader> {
  if (source.size > PACKAGE_LIMITS.compressedBytes) {
    throw new Error("Package exceeds compressed size limit");
  }
  abortIfNeeded(signal);

  const zip = new ZipReader(new BlobReader(source));
  try {
    const entries = await zip.getEntries();
    abortIfNeeded(signal);
    if (entries.length > PACKAGE_LIMITS.zipEntries) {
      throw new Error("Package has too many entries");
    }

    const entriesByName = new Map<string, Entry>();
    for (const entry of entries) {
      if (entriesByName.has(entry.filename)) {
        throw new Error(`Duplicate package entry: ${entry.filename}`);
      }
      entriesByName.set(entry.filename, entry);
    }

    const metadata = decodePackageMetadata(
      await readZipEntry(entriesByName.get("meta"), "meta", METADATA_BYTES, signal),
    );
    if (metadata.version !== 3) {
      throw new Error(`Unsupported package version: ${metadata.version}`);
    }
    if (!entriesByName.has("collection.anki21b")) {
      throw new Error("Modern Anki package is missing collection.anki21b");
    }

    const compressedManifest = await readZipEntry(
      entriesByName.get("media"),
      "media",
      PACKAGE_LIMITS.collectionBytes + ZIP_OVERHEAD_BYTES,
      signal,
    );
    const media = decodeMediaEntries(
      decompressIfZstd(compressedManifest, PACKAGE_LIMITS.collectionBytes),
    );
    validateMediaManifest(media, new Set(entriesByName.keys()));

    return {
      version: metadata.version,
      async readCollection() {
        const compressedCollection = await readZipEntry(
          entriesByName.get("collection.anki21b"),
          "collection.anki21b",
          PACKAGE_LIMITS.collectionBytes + ZIP_OVERHEAD_BYTES,
          signal,
        );
        abortIfNeeded(signal);
        return decompressIfZstd(compressedCollection, PACKAGE_LIMITS.collectionBytes);
      },
      async listMedia() {
        abortIfNeeded(signal);
        return media;
      },
      async readMedia(entry: MediaManifestEntry) {
        const compressedMedia = await readZipEntry(
          entriesByName.get(entry.zipEntry),
          entry.zipEntry,
          PACKAGE_LIMITS.mediaBytesEach + ZIP_OVERHEAD_BYTES,
          signal,
        );
        abortIfNeeded(signal);
        const value = decompressIfZstd(compressedMedia, PACKAGE_LIMITS.mediaBytesEach);
        if (value.byteLength !== entry.byteLength) {
          throw new Error(`Media size mismatch: ${entry.filename}`);
        }
        return value;
      },
      async close() {
        await zip.close();
      },
    };
  } catch (error) {
    await zip.close();
    throw error;
  }
}
