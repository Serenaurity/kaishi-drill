# Kaishi Drill

A self-contained, single-file HTML prototype that turns passive Anki review into
active recall. Built from the ["Anki Translation Practice App with Local AI"](.)
idea and a real deck export (`Kaishi 1.5k`), it asks you to type the answer
before revealing it, instead of flipping a card and self-grading.

Live version: https://claude.ai/code/artifact/e84452de-1f7b-4893-b7e1-4fbaee516a77

## What it does

Three drill modes, one page, no build step, no server:

- **Reading** — see a word, type the reading (kana or romaji — Hepburn and
  Kunrei-shiki variants both accepted, so no Japanese IME is required).
  Multi-reading words (e.g. 人 → ひと／じん) accept any valid reading.
- **Translate** — see a word, type an English gloss. Graded with a
  keyword-overlap heuristic (a deliberate stand-in for real LLM grading —
  see "Known limitations" below).
- **Kana** — DJT-style hiragana/katakana speed recognition drill across the
  full gojuon + dakuten/handakuten + youon set.

Real audio playback (word + example sentence) is embedded as base64 data URIs
pulled straight from the source deck, so it sounds like Anki, not TTS.

A GitHub-style contribution heatmap (26 weeks, `localStorage`-backed) tracks
daily rep counts, active days, and streak.

## Files

- `kaishi_drill.html` — the finished, self-contained prototype. Open it
  directly in a browser, no server needed.
- `kaishi_drill_template.html` — the source template. Edit this, not the
  built file. Contains an `__ITEMS_JSON__` placeholder for the sample data.
- `build_final_html.py` — splices `data/sample_items_audio.json` into the
  template to produce `kaishi_drill.html`. Requires a real Python
  interpreter (see gotcha below).
- `data/sample_items_audio.json` — 36 sample notes (word, reading, meaning,
  sentence, sentence meaning, word/sentence audio as base64) extracted from
  the user's own `Kaishi.1.5k.apkg` deck.
- `tests/` — Node.js DOM-stub test harnesses. They extract the *exact*
  shipped `<script>` out of `kaishi_drill.html` (via regex) and execute it
  against a hand-rolled DOM stub, driving it through real dispatched events.
  This verifies the actual production code, not a reimplementation.
  - `node_test.js` — reading-mode romaji/kana drive, translate mode,
    audio wiring.
  - `node_test2.js` — kana-mode drill, activity/heatmap tracking,
    regression check on reading + translate.
  - `node_test_sokuon.js` — targeted unit tests for sokuon (っ) and
    chōonpu (ー) romaji resolution.

## Rebuilding

```
node tests/node_test_sokuon.js
node tests/node_test.js
node tests/node_test2.js
```

To regenerate `kaishi_drill.html` after editing the template, run
`build_final_html.py` with a real Python interpreter (on this machine the
bare `python`/`python3` on PATH is a non-functional Windows Store shim —
invoke the actual interpreter directly, e.g.
`C:\Users\seren\AppData\Local\Programs\Python\Python311\python.exe build_final_html.py`).

## Known limitations

- **Translation grading is a keyword-overlap heuristic**, not real
  comprehension checking. It's an explicit stand-in for what the original
  idea called for (local-AI grading) — good enough to prototype the UX,
  not good enough to ship as-is.
- **Activity data is `localStorage`-only** — per-device, per-browser, not
  synced. The platform's live `artifact.publish()` capability was
  deliberately not used for this, because it triggers a full-page reload of
  every open view on every write, which is unacceptable UX for a
  rapid-fire quiz that persists after every answer.
- Only 36 sample notes are embedded, not the full 1,501-word deck.

## Scope

This is deliberately Kaishi-only for now — hardcoded to the Kaishi 1.5k
notetype's field names and to Japanese-specific reading logic (kana/romaji
conversion, sokuon/chōonpu handling). See the field-mapping and
grading-logic notes above for exactly what's coupled to it.

The intent is to eventually generalize this to work with any Anki deck,
any language. That's not implemented yet — no point abstracting before a
second real deck exists to design against. When that happens, the two
things to change are: (1) a field-mapping step instead of hardcoded field
names in `build_final_html.py`, so any notetype's fields can be assigned
to word/reading/meaning/audio; (2) gating the kana/romaji grading logic
behind "is this a Japanese deck" instead of assuming it always applies.
