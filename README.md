# Kaishi Drill

Kaishi Drill is a private, offline-first web app for active Japanese recall. It imports a modern Kaishi 1.5k Anki package locally, asks you to type readings or English meanings, schedules the two skills independently with FSRS, preserves package media, and includes a separate DJT-inspired Kana Trainer.

The current release is a standalone browser app. It does not require Anki while studying and does not write back to Anki.

## Supported workflow

- Import `.apkg` or `.colpkg` exported from the Kaishi 1.5k deck.
- Choose **Start Fresh** for new Kaishi Drill schedules or **Continue from Anki** to seed usable history from an export that includes scheduling information.
- Type Japanese readings in kana or accepted romaji variants.
- Type any accepted English meaning, including comma-separated alternatives and optional leading `to` on verbs. English is the only translation language supported in this release.
- See the example sentence and play word or sentence audio before submitting an answer; imported media stays local in IndexedDB.
- Follow the package's original New-card order. Informational notes without a reading or meaning are kept in the import but excluded from drills.
- Set daily New and Review card limits in Settings. Defaults are Anki's 20 New / 200 Review recommendation; because Reading and Meaning are separate cards, 20 New usually introduces about 10 words.
- Preview currently scheduled reviews for the next 14 days on the dashboard. The forecast updates as answers change the schedule.
- Practice Hiragana and Katakana separately from vocabulary scheduling, including Basic, Dakuten, Handakuten and Yōon groups.
- Install the PWA and reopen its application shell without a network connection.
- Export a JSON progress backup before resetting or moving to another browser profile.

Imported package bytes and media are processed in the browser. Kaishi Drill has no package-upload or cloud-sync endpoint.

## Local development

Requires Node.js 20 or newer.

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite. For a production build:

```powershell
npm run build
npm run preview
```

## Exporting from Anki

Export the Kaishi 1.5k deck as a modern Anki package. Include media. Also include scheduling information if you want **Continue from Anki**; without it, use **Start Fresh**.

Fresh mode discards imported Anki review history and creates all reading and meaning schedules as new. Continue mode imports available review history and seeds valid scheduling state; invalid or missing scheduling fields fall back safely to new cards with a warning.

Kaishi Drill never modifies the source package.

## Progress backup and reset

Open **Settings → Export progress backup** before clearing data. A backup contains schedules, review history, Kana mastery, activity and settings. It deliberately excludes imported notes and media.

To restore into another clean browser profile:

1. Import and initialize the exact same package.
2. Open **Settings → Progress backup file**.
3. Select the JSON backup and confirm the replacement.

The package SHA-256 and card identities must match. **Reset progress** preserves imported notes and media but requires the deck to be initialized again before a backup can be restored. **Reset all local data** removes the complete local deck.

## Verification

```powershell
npm run typecheck
npm run test:run
npm run test:e2e
npm run build
```

`npm run test:e2e` creates a synthetic, non-sensitive Anki package before running Chromium tests. The release gate covers Fresh and Continue flows, typed review persistence, unsafe markup, missing/remote media, duplicate-tab conflicts, Kana focus mode, keyboard shortcuts, backup/restore, critical axe checks, reduced motion and offline reload.

Kana answers also support a keyboard-first loop: a correct Enter submission advances immediately; an incorrect answer reveals the accepted romaji and focuses **Next**, where Enter advances.

The real-deck checks are intentionally separate: [private deck acceptance](docs/acceptance/private-deck-checklist.md). Private packages, extracted media and reports are ignored by Git.

## Boundaries

- No Anki write-back, AnkiWeb integration or cloud sync.
- No account system or server-side deck storage.
- No local-AI semantic grader; English grading uses explicit normalized aliases and conservative keyword matching.
- Kaishi 1.5k field mapping is supported; arbitrary Anki note types are not.
- A Windows `.exe` is Phase 4 work and starts only after the browser release is approved.

## Open assets

Kana stroke-order SVGs are a modified subset of KanjiVG. Release and license details are in [public/kana-strokes/NOTICE.md](public/kana-strokes/NOTICE.md).

## Legacy prototype

The original single-file prototype remains available as an immediate rollback/reference path:

- `kaishi_drill.html`
- `kaishi_drill_template.html`
- `build_final_html.py`
- `data/sample_items_audio.json`

The modular app under `src/` is the supported implementation. Product design and the phased implementation record remain in `docs/superpowers/`.
