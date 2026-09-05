import type { MediaManifestEntry, PackageMetadata } from "./types";

const textDecoder = new TextDecoder("utf-8", { fatal: true });

interface ProtobufField {
  field: number;
  wire: number;
  data: Uint8Array | number;
}

function readVarint(bytes: Uint8Array, start: number): [number, number] {
  let value = 0;
  let multiplier = 1;

  for (let index = start; index < bytes.length; index += 1) {
    const byte = bytes[index]!;
    value += (byte & 0x7f) * multiplier;
    if (!Number.isSafeInteger(value)) {
      throw new Error("Protobuf varint exceeds the safe integer range");
    }
    if ((byte & 0x80) === 0) {
      return [value, index + 1];
    }
    multiplier *= 128;
    if (multiplier > Number.MAX_SAFE_INTEGER) {
      throw new Error("Invalid protobuf varint");
    }
  }

  throw new Error("Truncated protobuf varint");
}

function decodeFields(bytes: Uint8Array): ProtobufField[] {
  const decoded: ProtobufField[] = [];
  let position = 0;

  while (position < bytes.length) {
    const [tag, afterTag] = readVarint(bytes, position);
    position = afterTag;
    const field = Math.floor(tag / 8);
    const wire = tag & 0x07;
    if (field === 0) {
      throw new Error("Invalid protobuf field");
    }

    if (wire === 0) {
      const [value, next] = readVarint(bytes, position);
      decoded.push({ field, wire, data: value });
      position = next;
      continue;
    }

    if (wire === 2) {
      const [length, afterLength] = readVarint(bytes, position);
      position = afterLength;
      if (length > bytes.length - position) {
        throw new Error("Truncated protobuf field");
      }
      decoded.push({ field, wire, data: bytes.slice(position, position + length) });
      position += length;
      continue;
    }

    throw new Error("Unsupported protobuf wire type");
  }

  return decoded;
}

export function decodePackageMetadata(bytes: Uint8Array): PackageMetadata {
  const versionField = decodeFields(bytes).find((field) => field.field === 1);
  if (
    !versionField ||
    versionField.wire !== 0 ||
    ![1, 2, 3].includes(versionField.data as number)
  ) {
    throw new Error("Unsupported package metadata");
  }
  return { version: versionField.data as 1 | 2 | 3 };
}

export function decodeMediaEntries(bytes: Uint8Array): MediaManifestEntry[] {
  const media: MediaManifestEntry[] = [];

  for (const outerField of decodeFields(bytes)) {
    if (outerField.field !== 1 || outerField.wire !== 2) {
      throw new Error("Invalid media manifest");
    }

    let filename = "";
    let byteLength: number | undefined;
    let sha1 = new Uint8Array(0);
    let legacyZipEntry: number | undefined;

    for (const field of decodeFields(outerField.data as Uint8Array)) {
      if (field.field === 1 && field.wire === 2) {
        filename = textDecoder.decode(field.data as Uint8Array);
      } else if (field.field === 2 && field.wire === 0) {
        byteLength = field.data as number;
      } else if (field.field === 3 && field.wire === 2) {
        sha1 = new Uint8Array(field.data as Uint8Array);
      } else if (field.field === 255 && field.wire === 0) {
        legacyZipEntry = field.data as number;
      } else {
        throw new Error("Invalid media entry");
      }
    }

    if (
      filename.length === 0 ||
      byteLength === undefined ||
      !Number.isSafeInteger(byteLength) ||
      byteLength < 0 ||
      sha1.length !== 20 ||
      (legacyZipEntry !== undefined && !Number.isSafeInteger(legacyZipEntry))
    ) {
      throw new Error("Invalid media entry");
    }

    media.push({
      zipEntry: String(legacyZipEntry ?? media.length),
      filename,
      byteLength,
      sha1,
    });
  }

  return media;
}
