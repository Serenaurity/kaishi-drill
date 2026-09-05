import type { ImportedMemoryState } from "./types";

export function parseAnkiCardData(data: string): ImportedMemoryState | undefined {
  if (!data) {
    return undefined;
  }
  try {
    const value = JSON.parse(data) as { s?: unknown; d?: unknown };
    return typeof value.s === "number" &&
      Number.isFinite(value.s) &&
      value.s > 0 &&
      typeof value.d === "number" &&
      Number.isFinite(value.d) &&
      value.d > 0
      ? { stability: value.s, difficulty: value.d }
      : undefined;
  } catch {
    return undefined;
  }
}
