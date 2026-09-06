# Kaishi Drill Standalone Web App Design

**Status:** Ready for user review. The product direction and modular PWA approach were approved on 2026-09-05.

**Audience:** Product owner and implementation agents.

## 1. Product decision

Kaishi Drill will become a standalone, local-first web application. It is not an Anki add-on and will never write directly to Anki's live collection. A later Windows `.exe` will wrap the same web application after the browser version is accepted.

The first release has two modules:

1. **Kaishi Vocabulary** — typed reading and English-translation drills scheduled with FSRS.
2. **Kana Trainer** — a DJT Kana-inspired recognition trainer with independent mastery state.

Both modules share one local profile, activity history, streak, settings, and dashboard.

## 2. Verified baseline

### Repository

- The current product is a single-file HTML prototype generated from `kaishi_drill_template.html` and 36 sample records.
- It shuffles an in-memory array instead of selecting due cards.
- Only daily aggregate activity is stored in `localStorage`; scores and card state disappear on reload.
- Translation grading uses keyword overlap.
- `tests/node_test.js` currently fails because its DOM stub is stale (`heatmapGrid` is missing); the other scripts mostly log instead of asserting.
- The shipped page has an encoding/runtime failure in a browser, so the prototype is not a safe base for incremental feature accumulation.

### Kaishi deck and Anki progress

Read-only inspection of `private-data/Kaishi.1.5k.apkg` on 2026-09-06 verified:

- 1,501 notes and 1,501 Anki cards.
- All 1,501 cards are New; the package contains no historical review-log entries or resumable Anki progress.
- Every New card has a unique Anki `due` position. Positions run from `3` through `1,504`, with `1,380` absent; gaps remain valid and must not be renumbered.
- The deck uses sequential insertion, a default limit of `20` New cards/day, and a default limit of `200` reviews/day.
- 4,354 media-manifest items: 1,382 images and 2,972 audio files.
- 1,500 notes reference a picture.
- 1,499 notes reference word audio; 1,500 reference sentence audio.
- The notetype exposes Word, Word Reading, Word Meaning, Word Furigana, Word Audio, Sentence, Sentence Meaning, Sentence Furigana, Sentence Audio, Notes, Pitch Accent, Pitch Accent Notes, Frequency, and Picture fields.

The inspected package uses Anki's modern package format: zstd-compressed collection/media payloads and a protobuf media manifest. The importer must support this format explicitly; treating `media` as legacy JSON is incorrect.

## 3. Goals

- Run as a responsive browser application and install as a PWA.
- Work offline after the application shell and a deck have been imported.
- Import the user's Kaishi `.apkg` content, images, and audio without committing private deck data to Git.
- Offer **Start Fresh** and **Continue from Anki** during onboarding.
- Preserve imported history and schedule provenance without writing to Anki.
- Use an upstream FSRS implementation, pinned by the lockfile, behind a Kaishi-owned scheduling adapter.
- Make typed recall the primary interaction.
- Grade reading answers deterministically and English meaning answers conservatively.
- Require the learner to confirm the final Anki-style rating.
- Keep vocabulary schedules separate by skill so reading strength cannot hide weak meaning recall.
- Recreate the useful DJT Kana interaction model without embedding the external site or copying unlicensed assets.
- Make future Windows packaging possible without redesigning storage or domain logic.

## 4. Non-goals for the first browser release

- An Anki Desktop add-on.
- Direct access to or mutation of Anki's open/live `collection.anki2` file.
- Automatic two-way synchronization with Anki.
- Cloud accounts, hosted databases, or multi-device sync.
- Thai translation answers.
- LLM-dependent grading.
- General support for arbitrary Anki notetypes.
- Mobile-native applications.
- Packaging the `.exe`; this follows browser acceptance.

## 5. User experience

### 5.1 First run

The app opens to an onboarding screen with a file picker for `.apkg` or `.colpkg`.

Import proceeds in a Web Worker and reports these stages:

1. Validate package and version.
2. Read the collection.
3. Detect the Kaishi notetype and map fields.
4. Validate notes and stable IDs.
5. Decode and store media.
6. Detect scheduling/history data.
7. Show an import summary and warnings.

No deck content is uploaded. The app must state that processing happens locally.

After a valid import:

- **Start Fresh** creates new Kaishi skill schedules and ignores imported scheduling for future reviews. The source scheduling is retained only as import metadata, not applied.
- **Continue from Anki** becomes available only when valid scheduling data is present. It seeds Kaishi schedules from the imported Anki cards and retains imported review history for analytics.

The choice is recorded in import metadata and can be replaced only by an explicit reset/reimport flow with a backup prompt.

### 5.2 Home

The home screen shows:

- Due vocabulary reviews.
- New-card allowance for the day, using Anki semantics: Reading and Meaning each count as one card.
- A 14-day Future Due forecast of currently scheduled non-New cards. The forecast excludes overdue cards and states that future answers and newly introduced cards can change it.
- Kana mistakes due for focused practice.
- Current streak and today's completed attempts.
- Entry points for Vocabulary, Kana Trainer, Import/Backup, and Settings.

### 5.3 Vocabulary session

Each Kaishi note produces two independently scheduled skill cards:

- `reading`: show the Japanese word and ask for kana or accepted romaji.
- `meaning`: show the Japanese word and ask for an English meaning.

Imported informational notes that lack either a usable Reading or English Meaning remain in the local deck for provenance but do not produce study skill cards. This excludes the package's leading Welcome card and leaves 1,500 studyable vocabulary notes.

Before submission, the prompt displays the deck picture and Japanese example sentence when available, plus user-triggered controls for word audio and sentence audio. Audio does not autoplay. Missing media uses the existing stable unavailable state.

Submission flow:

1. Normalize and grade the typed answer.
2. Reveal the canonical answer, English sentence meaning, furigana, pitch accent, notes, and remaining answer-side details without duplicating the prompt audio controls.
3. Suggest `Again`, `Hard`, or `Good` from the grade.
4. Let the learner select any of `Again`, `Hard`, `Good`, or `Easy`.
5. Atomically append a review event and update the schedule.
6. Show the next intervals before confirmation.

`Hard` always means a successful but difficult recall. A forgotten or incorrect answer suggests `Again`.

### 5.4 Kana Trainer

Kana Trainer is a separate route with shared activity tracking. It includes:

- Hiragana and katakana.
- Basic rows, dakuten/handakuten, and yōon combinations.
- Row/group selection, check all, and clear all.
- Randomized prompts and optional font variation.
- Typed romaji answers with accepted variants.
- Immediate correction, per-kana error counts, accuracy, and response time.
- Any correct submission (Enter or Check) records the attempt and advances immediately. An incorrect submission reveals the accepted romaji; pressing Enter again or choosing Next advances to the next prompt.
- Focus mode that prioritizes recent mistakes.
- Optional Japanese speech synthesis when a local `ja-JP` voice is available.
- Stroke-order viewing from a pinned, attributed KanjiVG dataset release; no assets are copied from DJT Kana.

Kana mastery is not fed into vocabulary FSRS. Kana attempts still contribute to the shared activity calendar.

## 6. Architecture

```text
User-selected APKG/COLPKG
          |
          v
Import Web Worker --> package validation --> Kaishi field mapping
          |                                      |
          v                                      v
   media blobs --------------------------> deck/content records
          |                                      |
          +---------------- IndexedDB -----------+
                             |
       +---------------------+----------------------+
       |                     |                      |
Vocabulary session     Kana Trainer            Dashboard
       |                     |                      |
grader -> rating       kana mastery              aggregates
       |
FSRS adapter -> review event + schedule transaction
```

### 6.1 Technology choices

- Node.js `>=20`; the development machine currently has Node.js `22.23.2`.
- TypeScript with strict mode.
- React and Vite for the application shell and routes.
- Dexie over IndexedDB for transactional local persistence and migrations.
- `ts-fsrs` for scheduling, installed with an exact version and lockfile.
- `@zip.js/zip.js` for package entry access without loading every entry at once.
- `fzstd` for Anki's zstd payloads.
- `sql.js` for read-only access to the extracted collection SQLite database.
- A minimal Kaishi-owned protobuf decoder/schema for `PackageMetadata` and `MediaEntries`; do not depend on Anki's unstable runtime API.
- DOMPurify with a minimal allowlist for trusted display fragments.
- `vite-plugin-pwa` for the manifest and application-shell service worker.
- Vitest, Testing Library, `fake-indexeddb`, and Playwright for automated validation.
- Tauri 2 is the intended later Windows wrapper, not a browser-release dependency.

All runtime dependencies are exact-pinned in `package-lock.json`. No CDN runtime dependency is allowed.

### 6.2 Boundaries

- `features/import` owns package parsing and produces a validated import bundle. It does not write UI state.
- `features/study` owns grading, queueing, and schedule transitions. Its core functions are deterministic and DOM-free.
- `features/kana` owns kana content and mastery, independent of FSRS vocabulary state.
- `storage` owns database schema, transactions, migrations, backup, and reset.
- `features/media` owns blob lookup, object-URL lifetime, and playback behavior.
- React components call application services; they never manipulate IndexedDB directly.

## 7. Data model

Stable identifiers must come from the package, never from shuffled array positions.

```ts
type Skill = "reading" | "meaning";
type Rating = "again" | "hard" | "good" | "easy";
type ImportMode = "fresh" | "continue";

interface DeckRecord {
  id: string;                  // sha256(package identity + Anki deck id)
  ankiDeckId: string;
  name: string;
  packageSha256: string;
  importedAt: string;          // ISO UTC
  importMode: ImportMode;
  schemaVersion: 1;
}

interface NoteRecord {
  id: string;                  // `${deckId}:${ankiNoteId}`
  deckId: string;
  ankiNoteId: string;
  word: string;
  reading: string;
  meaning: string;
  wordFurigana: string;
  sentence: string;
  sentenceMeaning: string;
  sentenceFurigana: string;
  notes: string;
  pitchAccent: string;
  pitchAccentNotes: string;
  frequency: string;
  pictureMediaId?: string;
  wordAudioMediaId?: string;
  sentenceAudioMediaId?: string;
}

interface ImportedAnkiCardRecord {
  id: string;                  // `${deckId}:${sourceAnkiCardId}`
  deckId: string;
  noteId: string;              // local NoteRecord id
  sourceAnkiCardId: string;
  state: number;
  queue: number;
  due: number;
  interval: number;
  reps: number;
  lapses: number;
  stability?: number;
  difficulty?: number;
  lastReviewAt?: string;
}

interface SkillCardRecord {
  id: string;                  // `${noteId}:${skill}`
  noteId: string;
  sourceAnkiCardId: string;
  sourceNewPosition?: number;  // Anki cards.due while the source card is New
  skill: Skill;
  createdAt: string;
}

interface ScheduleRecord {
  skillCardId: string;
  revision: number;             // optimistic-concurrency guard
  state: "new" | "learning" | "review" | "relearning";
  dueAt: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  lastReviewAt?: string;
  scheduler: "ts-fsrs";
  schedulerVersion: string;
  parametersHash: string;
  seededFromAnki: boolean;
}

interface ReviewEventRecord {
  id: string;
  skillCardId: string;
  occurredAt: string;
  localDate: string;
  timezone: string;
  answer: string;
  grade: "correct" | "close" | "incorrect";
  suggestedRating: Rating;
  selectedRating: Rating;
  responseMs: number;
  previousSchedule: ScheduleRecord;
  nextSchedule: ScheduleRecord;
}

interface ImportedAnkiReviewRecord {
  id: string;                  // original revlog id
  deckId: string;
  sourceAnkiCardId: string;
  occurredAt: string;
  rating: number;
  reviewType: number;
  interval: number;
  lastInterval: number;
  responseMs: number;
}

interface MediaRecord {
  id: string;                  // sha1 from media manifest
  deckId: string;
  filename: string;
  mimeType: string;
  byteLength: number;
  blob: Blob;
}

interface KanaSkillRecord {
  id: string;                  // `${script}:${kana}`
  attempts: number;
  correct: number;
  streak: number;
  lastSeenAt?: string;
  lastWrongAt?: string;
  meanResponseMs: number;
}

interface DailyActivityRecord {
  id: string;                  // `${profileId}:${localDate}`
  profileId: "local";
  localDate: string;
  vocabularyReviews: number;
  kanaAttempts: number;
}
```

Imported Anki reviews are stored once for provenance and historical charts. They are not duplicated across the two Kaishi skill cards. In Continue mode, the Anki card's current memory state seeds both skill schedules; subsequent reading and meaning histories diverge.

## 8. Import and media handling

### 8.1 Supported input

- Modern Anki package version 3 with zstd and protobuf media manifest.
- Legacy packages may be accepted only when the same normalized import contract can be produced and tested.
- Continue mode requires usable card scheduling data. If absent, the UI disables Continue and explains how to export a scheduling-inclusive package from Anki.

### 8.2 Validation

The import fails without partial writes when:

- ZIP/package metadata is invalid.
- No Kaishi 1.5k notetype can be mapped.
- Required `Word`, `Word Reading`, `Word Meaning`, or `Sentence` field definitions are absent. Individual notes may leave one of these values empty (the official welcome card does this) and remain importable.
- Duplicate stable IDs conflict.
- The collection cannot be opened read-only.

Missing optional media or optional fields produce warnings and an import report. A database transaction swaps the active deck only after all required validation passes.

### 8.3 Security

- Note HTML is treated as untrusted input.
- Audio references are parsed from `[sound:filename]`; image references are parsed from allowed `<img src="filename">` forms.
- No script, event handler, iframe, remote URL, style attribute, or SVG script content from a deck is rendered.
- Media MIME is inferred from both extension and signature where practical.
- Object URLs are revoked when the component unmounts or the selected card changes.
- Package size, decompressed size, entry count, and filename length have explicit limits to reduce ZIP-bomb and memory risk.

### 8.4 Privacy and repository policy

- User package files, extracted media, live collection copies, and generated private manifests are gitignored.
- Test fixtures contain only synthetic data.
- No import payload is sent over the network.

## 9. Scheduling and queue policy

### 9.1 FSRS adapter

The app wraps `ts-fsrs` behind its own interface:

```ts
interface Scheduler {
  preview(card: ScheduleRecord, reviewedAt: Date): Record<Rating, SchedulePreview>;
  answer(card: ScheduleRecord, rating: Rating, reviewedAt: Date): ScheduleResult;
}
```

The adapter is responsible for conversion between Kaishi records and the exact pinned library version. No UI imports `ts-fsrs` directly.

Defaults:

- Desired retention: `0.90`.
- Maximum interval: `36,500` days.
- Fuzz: enabled.
- Short-term learning: enabled.
- Learning steps: `1m, 10m`.
- Relearning step: `10m`.
- Daily new-card limit: `20` skill cards, matching Anki's card-count semantics. Because each Kaishi note creates Reading and Meaning cards, this normally introduces about 10 vocabulary notes/day.
- Daily review limit: `200` skill cards.

Settings exposes both limits as labeled numeric controls. `0` pauses that category, the default values are presented as the recommended Anki-compatible preset, and changes apply to the remaining allowance for the current local day. Imported parameters replace defaults only after they pass count/range validation and the importer records their provenance.

### 9.2 Queue ordering

For each session:

1. Overdue learning/relearning cards.
2. Due review cards, ordered by due time then lower retrievability.
3. New cards up to the daily limit, ordered by ascending imported Anki New position (`cards.due`) and then stable ID. Both Kaishi skill cards inherit their source card's position.

Reading and Meaning cards from the same note are not shown consecutively when another due card is available. Missing or invalid source positions fall back to stable Anki card/note identity; imported position gaps are preserved.

### 9.3 Atomic answer transaction

Confirming a rating must perform one IndexedDB transaction that:

1. Verifies the schedule has not changed since the prompt was loaded.
2. Appends the immutable review event.
3. Replaces the schedule with the calculated next schedule.
4. Updates the daily activity aggregate.

If the transaction fails, the card remains on screen and no partial event is shown as saved.

## 10. Grading

### 10.1 Reading

Accepted input includes hiragana, katakana, and normalized romaji. Normalization covers:

- Unicode NFKC and whitespace removal.
- Katakana-to-hiragana comparison.
- Hepburn/Kunrei alternatives present in the accepted-variant table.
- Sokuon, chōonpu, syllabic `n`, and yōon.
- Multiple readings separated by the deck's supported delimiters.

Exact normalized matches are `correct`; bounded typographical distance is `close`; all other input is `incorrect`.

### 10.2 English meaning

The importer derives explicit aliases from semicolon/comma-separated glosses and removes explanatory parentheticals only for comparison. Grading applies:

1. Unicode/case/punctuation/whitespace normalization.
2. Exact alias match.
3. Token-order-insensitive exact phrase match for multiword aliases.
4. A conservative edit-distance allowance for a single likely typo.

Each comma-, semicolon-, slash-, or pipe-separated gloss is an independent accepted answer after parenthetical notes are removed. For an infinitive gloss, both `to welcome` and `welcome` are accepted. Thus either `lover` or `sweetheart` passes for `lover, sweetheart`, and any one of `to welcome`, `to go out to meet`, or `to invite` passes independently. Keyword overlap alone cannot produce `correct`. Unrecognized paraphrases are shown as `close` and require self-rating. The first release does not call an LLM or network API.

### 10.3 Suggested rating

- `incorrect` or blank -> `Again`.
- `close` -> `Hard`.
- `correct` -> `Good`.
- `Easy` is never automatically suggested.

The learner may override the suggestion before the schedule is updated.

## 11. Offline, backup, reset, and future desktop packaging

- The service worker caches only versioned application-shell assets and open-licensed Kana assets.
- Imported deck/media/progress lives in IndexedDB, not Cache Storage.
- An update never deletes or migrates user data outside a versioned database migration.
- A progress backup is a JSON file containing schemas, settings, schedules, review events, Kana mastery, import provenance, and package hash. It excludes media because media can be reimported from the original package.
- Restore validates schema version and deck/package identity before replacing data.
- Reset offers three explicit scopes: session only, progress only, or deck and all data.
- The future Tauri wrapper reuses the same application services and database interfaces. A native storage adapter may replace IndexedDB without changing grading or scheduling code.

## 12. Accessibility and performance

- All study actions are keyboard accessible.
- Rating shortcuts are `1` Again, `2` Hard, `3` Good, and `4` Easy, enabled only after answer reveal.
- Focus never jumps unexpectedly when feedback appears.
- Audio controls expose labels and do not autoplay unless enabled.
- Color is not the sole indicator of correctness.
- Reduced-motion preferences are honored.
- Import runs off the main thread and emits progress at least every 100 entries or 250 ms.
- The application shell must remain responsive while importing the verified ~102 MB package.
- Media blobs are read lazily; a session does not create object URLs for the full deck.

## 13. Error handling and recovery

- Import errors identify the failed stage and do not destroy the previous active deck.
- Storage quota errors show required/available estimates when the browser exposes them.
- Missing audio/image renders a stable unavailable state and records a warning instead of blocking review.
- A failed service-worker update falls back to the current cached application shell.
- A schedule conflict caused by duplicate tabs asks the stale tab to reload the card; it does not write a second review.
- Before a destructive reset or restore, the UI offers progress export.

## 14. Validation and acceptance criteria

Automated checks must cover:

- Modern and legacy/synthetic package parsing.
- Protobuf media mapping and zstd decompression.
- Exact Kaishi field mapping and sanitization.
- Fresh and Continue onboarding branches.
- Imported schedule/card-data conversion and rating mapping.
- Deterministic FSRS transitions for fixed dates and parameters.
- Queue ordering, daily limits, sibling separation, and timezone boundaries.
- Imported Anki New-position preservation, including non-contiguous positions.
- Reading normalization including sokuon/chōonpu.
- English exact aliases, comma-separated glosses, infinitives with optional leading `to`, typo, close, and incorrect cases.
- Atomic persistence, migrations, backup/restore, and duplicate-tab conflict.
- Media playback and object-URL cleanup.
- Kana selection, variants, mistake focus, mastery updates, immediate advance after a correct submission, and Enter-to-continue after an incorrect answer.
- Persistent New/review limits and a timezone-correct 14-day Future Due forecast.
- Sentence and both audio controls being available before vocabulary submission without duplicate controls after reveal.
- Keyboard and screen-reader basics.
- Offline reload after a successful install/import.

Manual validation against the user's private package must verify, without committing the report:

- 1,501 notes imported.
- 1,382 image files and 2,972 audio files discovered.
- Picture/word-audio/sentence-audio references resolve at the verified counts.
- Start Fresh produces no imported due schedules.
- Continue is disabled for this package because it contains 1,501 New cards and no review history.
- New cards follow the package's unique ascending positions (`3` to `1,504`, with `1,380` absent).
- The informational Welcome note at position `3` is retained but excluded from study; the first studyable word is `私` at position `4`.
- Refreshing and closing/reopening the browser preserves the current card state and progress.

## 15. Delivery phases

1. **Foundation and importer:** application shell, schema, modern APKG importer, synthetic fixtures, import report, and local media storage.
2. **Vocabulary engine:** Fresh/Continue onboarding, FSRS adapter, queue, grading, transactional reviews, and vocabulary UI.
3. **Kana and product hardening:** Kana Trainer, dashboard, PWA/offline behavior, backup/restore, accessibility, performance, and private-deck acceptance run.
4. **Windows follow-up:** after browser approval, wrap with Tauri and add native file/storage adapters.

Each phase must leave a runnable, tested application. The legacy prototype remains available until the replacement passes the private-deck acceptance run; removal is a separate explicit decision.

## 16. Rollback strategy

- Development happens on a `codex/` branch.
- The current prototype files remain untouched during foundation work.
- Each phase is split into reviewable commits and can be reverted independently.
- Database migrations are additive until a backup/restore round trip passes.
- The active-deck swap occurs only after a complete import transaction.
- No commit contains the user's `.apkg`, collection database, extracted media, or personal progress.

## 17. Sources

- Anki deck options and FSRS behavior: <https://docs.ankiweb.net/deck-options.html#fsrs>
- Anki package protobuf definitions: <https://github.com/ankitects/anki/blob/main/proto/anki/import_export.proto>
- Anki architecture note: <https://github.com/ankitects/anki/blob/main/docs/architecture.md>
- TypeScript FSRS implementation: <https://github.com/open-spaced-repetition/ts-fsrs>
- DJT Kana behavior reference: <https://djtguide.neocities.org/kana/>
- KanjiVG project and license: <https://kanjivg.tagaini.net/>
