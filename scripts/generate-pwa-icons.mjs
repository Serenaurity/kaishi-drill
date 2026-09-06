import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "public", "icons");

// A deterministic, path-only 改 monogram. It deliberately avoids system fonts so
// the generated PNGs stay identical across developer machines and CI.
const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#f6f4ef"/>
  <g fill="none" stroke="#1c1b19" stroke-width="34" stroke-linecap="square" stroke-linejoin="round">
    <path d="M92 112h132v92H118v116h118"/>
    <path d="M178 204v198"/>
    <path d="M92 404c58-28 102-69 132-124"/>
    <path d="M294 100c-6 62-23 116-51 162"/>
    <path d="M276 176h145"/>
    <path d="M314 177c15 99 55 173 119 222"/>
    <path d="M407 179c-18 98-63 172-137 221"/>
  </g>
</svg>`;

await mkdir(outputDirectory, { recursive: true });
for (const size of [192, 512]) {
  await sharp(Buffer.from(iconSvg))
    .resize(size, size)
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toFile(path.join(outputDirectory, `icon-${size}.png`));
}
