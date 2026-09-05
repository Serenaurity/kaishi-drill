import { Decompress } from "fzstd";

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd] as const;
const INPUT_CHUNK_BYTES = 64 * 1024;

export function isZstd(bytes: Uint8Array): boolean {
  return ZSTD_MAGIC.every((byte, index) => bytes[index] === byte);
}

function readLittleEndian(bytes: Uint8Array, offset: number, length: number): bigint {
  if (offset + length > bytes.length) {
    throw new Error("Truncated zstd frame header");
  }

  let value = 0n;
  for (let index = 0; index < length; index += 1) {
    value |= BigInt(bytes[offset + index]!) << BigInt(index * 8);
  }
  return value;
}

function validateDeclaredFrameBounds(bytes: Uint8Array, limit: number): void {
  if (bytes.length < 5) {
    throw new Error("Truncated zstd frame header");
  }

  const descriptor = bytes[4]!;
  const singleSegment = (descriptor & 0x20) !== 0;
  const dictionaryIdFlag = descriptor & 0x03;
  const contentSizeFlag = descriptor >>> 6;
  let offset = 5;

  if (!singleSegment) {
    if (offset >= bytes.length) {
      throw new Error("Truncated zstd frame header");
    }
    const windowDescriptor = bytes[offset]!;
    offset += 1;
    const exponent = windowDescriptor >>> 3;
    const mantissa = windowDescriptor & 0x07;
    const windowBase = 2 ** (10 + exponent);
    const windowSize = windowBase + (windowBase / 8) * mantissa;
    if (windowSize > limit) {
      throw new Error("Decompressed package content exceeds limit");
    }
  }

  const dictionaryIdBytes = [0, 1, 2, 4][dictionaryIdFlag]!;
  offset += dictionaryIdBytes;
  const contentSizeBytes =
    contentSizeFlag === 0
      ? singleSegment
        ? 1
        : 0
      : contentSizeFlag === 1
        ? 2
        : contentSizeFlag === 2
          ? 4
          : 8;

  if (contentSizeBytes === 0) {
    return;
  }

  let contentSize = readLittleEndian(bytes, offset, contentSizeBytes);
  if (contentSizeBytes === 2) {
    contentSize += 256n;
  }
  if (contentSize > BigInt(limit)) {
    throw new Error("Decompressed package content exceeds limit");
  }
}

function concatenate(chunks: Uint8Array[], total: number): Uint8Array {
  if (chunks.length === 1) {
    return chunks[0]!;
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function decompressIfZstd(bytes: Uint8Array, limit: number): Uint8Array {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new Error("Invalid decompression limit");
  }

  if (!isZstd(bytes)) {
    if (bytes.byteLength > limit) {
      throw new Error("Decompressed package content exceeds limit");
    }
    return bytes;
  }

  validateDeclaredFrameBounds(bytes, limit);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const decoder = new Decompress((chunk) => {
    total += chunk.byteLength;
    if (total > limit) {
      throw new Error("Decompressed package content exceeds limit");
    }
    chunks.push(chunk.slice());
  });

  for (let offset = 0; offset < bytes.byteLength; offset += INPUT_CHUNK_BYTES) {
    const end = Math.min(offset + INPUT_CHUNK_BYTES, bytes.byteLength);
    decoder.push(bytes.subarray(offset, end), end === bytes.byteLength);
  }

  return concatenate(chunks, total);
}
