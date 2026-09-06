import { useState } from "react";
import type { KanaEntry } from "./kana-catalog";

interface StrokeOrderProps {
  entry: KanaEntry;
}

function StrokeGlyph({ codePoint, kana }: { codePoint: string; kana: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="stroke-fallback" lang="ja">{kana}</span>;
  return (
    <img
      src={`/kana-strokes/${codePoint}.svg`}
      alt={`Stroke order for ${kana}`}
      onError={() => setFailed(true)}
    />
  );
}

export function StrokeOrder({ entry }: StrokeOrderProps) {
  const characters = [...entry.kana];
  const codePoints = entry.strokeCodePoint.split(",");
  return (
    <figure className="stroke-order">
      <div className="stroke-glyphs">
        {characters.map((character, index) => (
          <StrokeGlyph key={`${character}:${index}`} kana={character} codePoint={codePoints[index]!} />
        ))}
      </div>
      <figcaption>Stroke order</figcaption>
    </figure>
  );
}
