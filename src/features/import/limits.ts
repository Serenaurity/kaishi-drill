export const PACKAGE_LIMITS = {
  zipEntries: 20_000,
  compressedBytes: 512 * 1024 * 1024,
  collectionBytes: 256 * 1024 * 1024,
  mediaBytesEach: 64 * 1024 * 1024,
  mediaBytesTotal: 2 * 1024 * 1024 * 1024,
  filenameCodePoints: 255,
} as const;
