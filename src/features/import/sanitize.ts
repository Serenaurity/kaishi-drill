import DOMPurify from "dompurify";

export const DISPLAY_TAGS = ["b", "br", "em", "i", "span", "strong"] as const;
export const DISPLAY_ATTRS: string[] = [];

const forbiddenBlocks =
  /<(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const allowedTag = /^<\s*(\/?)\s*(b|br|em|i|span|strong)\b[^>]*>$/i;
const anyTag = /<[^>]*>/g;

function conservativeWorkerSanitize(value: string): string {
  return value
    .replace(forbiddenBlocks, "")
    .replace(anyTag, (candidate) => {
      const match = allowedTag.exec(candidate);
      if (!match) {
        return "";
      }
      const closing = match[1] ?? "";
      const tag = match[2] ?? "";
      const normalizedTag = tag.toLowerCase();
      if (normalizedTag === "br") {
        return "<br>";
      }
      return `<${closing ? "/" : ""}${normalizedTag}>`;
    });
}

export function sanitizeDisplay(value: string): string {
  const workerSafeValue = conservativeWorkerSanitize(value);
  if (DOMPurify.isSupported) {
    return DOMPurify.sanitize(workerSafeValue, {
      ALLOWED_TAGS: [...DISPLAY_TAGS],
      ALLOWED_ATTR: DISPLAY_ATTRS,
    });
  }
  return workerSafeValue;
}

export function isLocalFilename(value: string): boolean {
  return (
    value.length > 0 &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    !value.startsWith("/") &&
    !value.split("/").some((part) => part === "..") &&
    !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
    Array.from(value).length <= 255
  );
}

export function localImage(value: string): string | undefined {
  const match = /<img\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)["']?[^>]*>/i.exec(value);
  const source = match?.[1];
  return source && isLocalFilename(source) ? source : undefined;
}

export function sound(value: string): string | undefined {
  const match = /\[sound:([^\]\0]+)\]/i.exec(value);
  const source = match?.[1];
  return source && isLocalFilename(source) ? source : undefined;
}
