# Kaishi Drill Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken single-file prototype with a tested, offline-first Kaishi web app that imports Anki packages and media, supports Fresh or Continue progress, schedules typed vocabulary reviews with FSRS, and includes a separate DJT-inspired Kana Trainer.

**Architecture:** Build a strict TypeScript React PWA with domain logic isolated from React. Parse user-selected packages in a Web Worker, store normalized deck content/media/progress in IndexedDB through Dexie, and wrap the exact-pinned `ts-fsrs` dependency behind a Kaishi scheduler adapter. Keep the legacy prototype untouched until the private-deck acceptance run passes.

**Tech Stack:** Node.js >=20 (validated with 22.23.2), TypeScript, React, Vite, Dexie, ts-fsrs, zip.js, fzstd, zstd-wasm for synthetic fixture compression, sql.js, DOMPurify, Vitest, Testing Library, fake-indexeddb, Playwright, vite-plugin-pwa.

**Spec:** `docs/superpowers/specs/2026-09-05-kaishi-drill-standalone-webapp-design.md`

## Global Constraints

- The browser release is standalone and local-first; it is not an Anki add-on.
- Never write to Anki's live collection and never upload an imported package or progress.
- Support the verified modern Anki package format with zstd collection/media payloads and a protobuf media manifest.
- Keep translation answers English-only in the first release.
- Keep vocabulary FSRS schedules independent for `reading` and `meaning` skills.
- Keep Kana mastery independent from vocabulary FSRS while sharing daily activity.
- Use desired retention `0.90`, maximum interval `36,500` days, fuzz enabled, short-term learning enabled, learning steps `1m, 10m`, relearning step `10m`, daily new limit `20`, and daily review limit `200` unless valid imported settings replace them.
- Exact-pin runtime and development dependencies in `package-lock.json`; use no CDN runtime dependencies.
- Treat all imported note HTML and filenames as untrusted.
- Do not commit `.apkg`, `.colpkg`, `.anki2`, extracted media, private manifests, or private acceptance reports.
- Preserve `kaishi_drill.html`, `kaishi_drill_template.html`, `build_final_html.py`, and current sample data until the replacement passes acceptance.

---

## File map

```text
index.html                              Vite entry document
package.json / package-lock.json        exact dependency and script definitions
vite.config.ts                          Vite, Vitest and PWA configuration
src/main.tsx                            React bootstrap
src/app/App.tsx                         routes and top-level providers
src/app/AppShell.tsx                    navigation and layout
src/domain/models.ts                    shared persisted/domain records
src/domain/result.ts                    typed success/failure contract
src/storage/db.ts                       Dexie database and schema versions
src/storage/repositories.ts             transactional repository interface
src/storage/backup.ts                   progress-only backup/restore
src/features/import/                    APKG/COLPKG parsing and onboarding
src/features/media/                     blob lookup and playback lifecycle
src/features/study/                     scheduler, queue, graders and session service
src/features/kana/                      kana catalog, grading, mastery and UI
src/features/dashboard/                 due/activity aggregation and UI
src/styles/                              tokens and application styles
public/kana-strokes/                    pinned attributed KanjiVG subset
tests/fixtures/                          synthetic package builders only
tests/e2e/                               Playwright browser tests
docs/acceptance/private-deck-checklist.md non-sensitive manual checklist
```

## Cross-task contracts

Task 2 copies the persisted interfaces from the spec into `src/domain/models.ts`. The following non-persisted contracts are created in the owning task and retain these exact names across the plan:

```ts
export interface PackageMetadata { version: 1 | 2 | 3 }
export interface MediaManifestEntry {
  zipEntry: string;
  filename: string;
  byteLength: number;
  sha1: Uint8Array;
}
export interface PackageReader {
  readonly version: 1 | 2 | 3;
  readCollection(): Promise<Uint8Array>;
  listMedia(): Promise<MediaManifestEntry[]>;
  readMedia(entry: MediaManifestEntry): Promise<Uint8Array>;
  close(): Promise<void>;
}
export interface FieldDefinition { ord: number; name: string }
export interface AnkiNoteRow { id: string; mid: string; flds: string; tags: string }
export interface ImportedMemoryState { stability: number; difficulty: number }
export interface ImportedAnkiCard {
  id: string;
  noteId: string;
  state: number;
  queue: number;
  due: number;
  interval: number;
  reps: number;
  lapses: number;
  memoryState?: ImportedMemoryState;
  lastReviewAt?: string;
}
export interface NormalizedNote extends Omit<NoteRecord,
  "id" | "deckId" | "pictureMediaId" | "wordAudioMediaId" | "sentenceAudioMediaId"> {
  pictureFilename?: string;
  wordAudioFilename?: string;
  sentenceAudioFilename?: string;
}
export interface NormalizedCollection {
  deck: { ankiDeckId: string; name: string };
  notes: NormalizedNote[];
  cards: ImportedAnkiCard[];
  reviews: ImportedAnkiReviewRecord[];
  schedulerParameters?: number[];
}
export type NormalizedFields = Record<string, string>;
export interface NoteMediaReferences {
  pictureFilename?: string;
  wordAudioFilename?: string;
  sentenceAudioFilename?: string;
}
export interface SchedulerConfig {
  desiredRetention: number;
  maximumIntervalDays: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  learningSteps: string[];
  relearningSteps: string[];
  parameters?: number[];
}
export interface SchedulePreview { dueAt: string; scheduledDays: number }
export interface ScheduleResult {
  previous: ScheduleRecord;
  next: ScheduleRecord;
  preview: SchedulePreview;
}
export interface Scheduler {
  preview(card: ScheduleRecord, reviewedAt: Date): Record<Rating, SchedulePreview>;
  answer(card: ScheduleRecord, rating: Rating, reviewedAt: Date): ScheduleResult;
}
export interface GradeResult {
  grade: "correct" | "close" | "incorrect";
  normalizedAnswer: string;
  matchedAlias?: string;
  suggestedRating: Rating;
  reason: string;
}
export type SkillCardId = string;
export interface ImportRequest { source: Blob; filename: string }
export interface ImportDependencies {
  db: KaishiDb;
  now(): Date;
  sha256(bytes: Uint8Array): Promise<string>;
  progress(event: ImportProgress): void;
}
export interface ProgressInitRequest {
  deckId: string;
  mode: ImportMode;
  now: Date;
}
export interface ProgressInitReport {
  skillCardsCreated: number;
  seededSchedules: number;
  importedReviews: number;
  warnings: string[];
}
export interface StudyPrompt {
  card: SkillCardRecord;
  note: NoteRecord;
  schedule: ScheduleRecord;
  scheduleRevision: number;
  intervals: Record<Rating, SchedulePreview>;
}
export interface StudySessionDependencies {
  db: KaishiDb;
  scheduler: Scheduler;
  now(): Date;
  timezone(): string;
}
export interface StudySession {
  loadNext(): Promise<StudyPrompt | undefined>;
  submitAnswer(answer: string, responseMs: number): GradeResult;
  confirmRating(rating: Rating): Promise<StudyPrompt | undefined>;
}
export interface KanaEntry {
  id: string;
  script: "hiragana" | "katakana";
  group: "basic" | "dakuten" | "handakuten" | "yoon";
  kana: string;
  romaji: readonly string[];
  strokeCodePoint: string;
}
export interface KanaGrade { correct: boolean; normalizedAnswer: string }
export interface KanaSession {
  next(): Promise<KanaEntry | undefined>;
  answer(value: string, responseMs: number): Promise<KanaGrade>;
}
export interface DashboardModel {
  dueVocabulary: number;
  newVocabularyAvailable: number;
  lifetimeVocabularyReviews: number;
  today: { vocabularyReviews: number; kanaAttempts: number };
  streakDays: number;
  activity: Array<{ localDate: string; vocabularyReviews: number; kanaAttempts: number }>;
  vocabularyAccuracy: number;
  weakKana: KanaSkillRecord[];
}
export interface ProgressBackupV1 {
  schemaVersion: 1;
  exportedAt: string;
  deckId: string;
  packageSha256: string;
  settings: SettingRecord[];
  schedules: ScheduleRecord[];
  reviewEvents: ReviewEventRecord[];
  ankiReviews: ImportedAnkiReviewRecord[];
  kanaSkills: KanaSkillRecord[];
  dailyActivity: DailyActivityRecord[];
}
```

## Phase 1 — Foundation and importer

### Task 1: Scaffold the strict TypeScript application without deleting the prototype

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/AppShell.tsx`
- Create: `src/app/App.test.tsx`
- Create: `src/styles/tokens.css`
- Create: `src/styles/app.css`
- Modify: `.gitignore`

**Interfaces:**
- Produces: a runnable React shell with routes `/`, `/import`, `/study`, `/kana`, and `/settings`.
- Produces: scripts `dev`, `build`, `test`, `test:run`, `typecheck`, and `preview`.

- [ ] **Step 1: Add private-data exclusions before installing or generating files**

```gitignore
node_modules/
dist/
playwright-report/
test-results/
*.apkg
*.colpkg
*.anki2
*.anki21
*.anki21b
private-data/
private-reports/
```

- [ ] **Step 2: Install exact-pinned application and test dependencies**

```powershell
npm init -y
npm install --save-exact react react-dom react-router-dom dexie ts-fsrs @zip.js/zip.js fzstd sql.js dompurify
npm install --save-dev --save-exact typescript vite @vitejs/plugin-react vitest jsdom fake-indexeddb @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/react @types/react-dom @types/sql.js @bokuweb/zstd-wasm
```

- [ ] **Step 3: Write the failing shell test**

```tsx
// src/app/App.test.tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

it("shows the two study modules", () => {
  render(<MemoryRouter><App /></MemoryRouter>);
  expect(screen.getByRole("link", { name: /vocabulary/i })).toBeVisible();
  expect(screen.getByRole("link", { name: /kana trainer/i })).toBeVisible();
});
```

- [ ] **Step 4: Run the test and verify the missing module failure**

```powershell
npx vitest run src/app/App.test.tsx
```

Expected: FAIL because `src/app/App.tsx` does not exist.

- [ ] **Step 5: Implement the minimal routed shell**

```tsx
// src/app/App.tsx
import { NavLink, Route, Routes } from "react-router-dom";

export function App() {
  return (
    <>
      <nav aria-label="Primary">
        <NavLink to="/study">Vocabulary</NavLink>
        <NavLink to="/kana">Kana Trainer</NavLink>
      </nav>
      <Routes>
        <Route path="*" element={<main><h1>Kaishi Drill</h1></main>} />
      </Routes>
    </>
  );
}
```

Configure Vitest with `environment: "jsdom"`, strict TypeScript, UTF-8 metadata, and the script names listed above. Import `tokens.css` and `app.css` from `src/main.tsx`.

- [ ] **Step 6: Run the foundation checks**

```powershell
npm run test:run
npm run typecheck
npm run build
```

Expected: all commands exit 0; `dist/index.html` exists; all legacy prototype files remain present and unchanged.

- [ ] **Step 7: Commit the scaffold**

```powershell
git add .gitignore package.json package-lock.json index.html tsconfig.json vite.config.ts src
git commit -m "build: scaffold Kaishi web app"
```

### Task 2: Define domain records and versioned IndexedDB storage

**Files:**
- Create: `src/domain/models.ts`
- Create: `src/domain/result.ts`
- Create: `src/storage/db.ts`
- Create: `src/storage/repositories.ts`
- Create: `src/storage/db.test.ts`

**Interfaces:**
- Produces: the spec's `DeckRecord`, `NoteRecord`, `SkillCardRecord`, `ScheduleRecord`, `ReviewEventRecord`, `ImportedAnkiReviewRecord`, `MediaRecord`, `KanaSkillRecord`, and `DailyActivityRecord` interfaces.
- Produces: `openKaishiDb(name?: string): KaishiDb`.
- Produces: `deleteKaishiDb(name: string): Promise<void>` for isolated tests only.

- [ ] **Step 1: Write the failing schema test**

```ts
// src/storage/db.test.ts
import "fake-indexeddb/auto";
import { deleteKaishiDb, openKaishiDb } from "./db";

it("opens schema version one with every required store", async () => {
  const name = `kaishi-test-${crypto.randomUUID()}`;
  const db = openKaishiDb(name);
  await db.open();
  expect(db.tables.map((table) => table.name).sort()).toEqual([
    "ankiReviews", "dailyActivity", "decks", "imports", "kanaSkills",
    "media", "notes", "reviewEvents", "schedules", "settings", "skillCards",
  ]);
  db.close();
  await deleteKaishiDb(name);
});
```

- [ ] **Step 2: Verify the test fails before the schema exists**

```powershell
npx vitest run src/storage/db.test.ts
```

Expected: FAIL with an unresolved `./db` import.

- [ ] **Step 3: Implement the records and Dexie schema**

```ts
// src/storage/db.ts
import Dexie, { type EntityTable } from "dexie";
import type {
  DailyActivityRecord, DeckRecord, ImportedAnkiReviewRecord, KanaSkillRecord,
  MediaRecord, NoteRecord, ReviewEventRecord, ScheduleRecord, SkillCardRecord,
} from "../domain/models";

export class KaishiDb extends Dexie {
  decks!: EntityTable<DeckRecord, "id">;
  notes!: EntityTable<NoteRecord, "id">;
  skillCards!: EntityTable<SkillCardRecord, "id">;
  schedules!: EntityTable<ScheduleRecord, "skillCardId">;
  reviewEvents!: EntityTable<ReviewEventRecord, "id">;
  ankiReviews!: EntityTable<ImportedAnkiReviewRecord, "id">;
  media!: EntityTable<MediaRecord, "id">;
  kanaSkills!: EntityTable<KanaSkillRecord, "id">;
  dailyActivity!: EntityTable<DailyActivityRecord, "id">;
  imports!: Dexie.Table<ImportRecord, string>;
  settings!: Dexie.Table<SettingRecord, string>;

  constructor(name = "kaishi-drill") {
    super(name);
    this.version(1).stores({
      decks: "id, ankiDeckId, importedAt",
      notes: "id, deckId, ankiNoteId, [deckId+ankiNoteId]",
      skillCards: "id, noteId, sourceAnkiCardId, [noteId+skill]",
      schedules: "skillCardId, dueAt, [state+dueAt], revision",
      reviewEvents: "id, skillCardId, occurredAt, localDate",
      ankiReviews: "id, sourceAnkiCardId, occurredAt",
      media: "id, deckId, filename, [deckId+filename]",
      kanaSkills: "id, lastWrongAt",
      dailyActivity: "id, localDate, [profileId+localDate]",
      imports: "id, packageSha256, importedAt",
      settings: "key",
    });
  }
}
```

Define `ImportRecord` with package version, counts, warnings, scheduling availability, and import mode. Define `SettingRecord` as `{ key: string; value: unknown }` and keep all domain types free of Dexie imports.

- [ ] **Step 4: Run schema, type and full tests**

```powershell
npx vitest run src/storage/db.test.ts
npm run typecheck
npm run test:run
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the storage foundation**

```powershell
git add src/domain src/storage
git commit -m "feat: add versioned local data model"
```

### Task 3: Decode modern Anki package metadata and media safely

**Files:**
- Create: `src/features/import/package-reader.ts`
- Create: `src/features/import/protobuf.ts`
- Create: `src/features/import/zstd.ts`
- Create: `src/features/import/limits.ts`
- Create: `src/features/import/types.ts`
- Create: `src/features/import/package-reader.test.ts`
- Create: `tests/fixtures/build-modern-package.ts`
- Create: `tests/fixtures/write-synthetic-package.mts`
- Modify: `package.json`

**Interfaces:**
- Produces: `readPackage(source: Blob, signal?: AbortSignal): Promise<PackageReader>`.
- Produces: `decodePackageMetadata(bytes: Uint8Array): PackageMetadata`.
- Produces: `decodeMediaEntries(bytes: Uint8Array): MediaManifestEntry[]`.
- Produces: `decompressIfZstd(bytes: Uint8Array, limit: number): Uint8Array`.
- `PackageReader` exposes `readCollection()`, `listMedia()`, `readMedia(entry)`, and `close()`.

- [ ] **Step 1: Build a synthetic modern-package fixture in memory**

Use zip.js to create entries named `meta`, `collection.anki21b`, `media`, `0`, and `1`. Encode the exact protobuf wire fields from Anki's `PackageMetadata` and `MediaEntries` definitions, then use the dev-only `@bokuweb/zstd-wasm` package to zstd-compress the collection, manifest, and individual media payloads. Runtime import continues to use the smaller decompression-only `fzstd` package.

```ts
export interface SyntheticPackageInput {
  collectionBytes: Uint8Array;
  media: Array<{ name: string; bytes: Uint8Array; sha1: Uint8Array }>;
}

export async function buildModernPackage(input: SyntheticPackageInput): Promise<Blob>;
```

`write-synthetic-package.mts` creates a complete two-note fixture at `test-results/fixtures/synthetic-kaishi.apkg`. Add script `fixture:apkg` that runs it with `tsx`, and install `tsx` as an exact-pinned development dependency. The generated package remains ignored by Git.

```powershell
npm install --save-dev --save-exact tsx
npm run fixture:apkg
```

- [ ] **Step 2: Write failing metadata/media tests**

```ts
it("reads Anki package v3 media names without treating the manifest as JSON", async () => {
  const blob = await buildModernPackage({
    collectionBytes: new Uint8Array([1, 2, 3]),
    media: [{ name: "語.webp", bytes: new Uint8Array([4, 5]), sha1: new Uint8Array(20) }],
  });
  const pkg = await readPackage(blob);
  expect(pkg.version).toBe(3);
  expect(await pkg.listMedia()).toEqual([
    expect.objectContaining({ zipEntry: "0", filename: "語.webp", byteLength: 2 }),
  ]);
  expect(await pkg.readCollection()).toEqual(new Uint8Array([1, 2, 3]));
  await pkg.close();
});
```

Add cases for invalid protobuf wire types, truncated varints, zstd output above the declared limit, path traversal filenames, excessive entry count, and abort.

- [ ] **Step 3: Run the importer-unit test and verify failure**

```powershell
npx vitest run src/features/import/package-reader.test.ts
```

Expected: FAIL because the reader modules do not exist.

- [ ] **Step 4: Implement bounded decoding**

Set constants in `limits.ts`:

```ts
export const PACKAGE_LIMITS = {
  zipEntries: 20_000,
  compressedBytes: 512 * 1024 * 1024,
  collectionBytes: 256 * 1024 * 1024,
  mediaBytesEach: 64 * 1024 * 1024,
  mediaBytesTotal: 2 * 1024 * 1024 * 1024,
  filenameCodePoints: 255,
} as const;
```

Reject absolute paths, `..`, NUL characters, backslashes, remote URLs, and duplicate manifest filenames. Detect zstd with magic bytes `28 b5 2f fd`; return legacy raw bytes only when the magic is absent.

- [ ] **Step 5: Run importer, type and full tests**

```powershell
npx vitest run src/features/import/package-reader.test.ts
npm run typecheck
npm run test:run
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit the safe package reader**

```powershell
git add src/features/import tests/fixtures package.json package-lock.json
git commit -m "feat: read modern Anki packages safely"
```

### Task 4: Read the Anki collection and normalize Kaishi fields

**Files:**
- Create: `src/features/import/collection-reader.ts`
- Create: `src/features/import/kaishi-mapping.ts`
- Create: `src/features/import/anki-scheduling.ts`
- Create: `src/features/import/sanitize.ts`
- Create: `src/features/import/collection-reader.test.ts`
- Modify: `tests/fixtures/build-modern-package.ts`

**Interfaces:**
- Produces: `readKaishiCollection(bytes: Uint8Array): Promise<NormalizedCollection>`.
- Produces: `mapKaishiNote(row: AnkiNoteRow, fields: FieldDefinition[]): NormalizedNote`.
- Produces: `parseAnkiCardData(data: string): ImportedMemoryState | undefined`.
- Produces: `extractMediaReferences(fields: NormalizedFields): NoteMediaReferences`.

- [ ] **Step 1: Extend the fixture builder with a two-note SQLite collection**

Create a sql.js database with the actual columns consumed by the importer: `decks`, `notetypes`, `fields`, `notes`, `cards`, and `revlog`. Use synthetic note text, one image, two sounds, one reviewed card with `{ "s": 12.5, "d": 6.2, "dr": 0.91, "pos": 0 }`, and one new card with `{}`.

- [ ] **Step 2: Write the failing collection contract test**

```ts
it("maps Kaishi fields, scheduling state and review history", async () => {
  const result = await readKaishiCollection(fixtureCollectionBytes);
  expect(result.notes).toHaveLength(2);
  expect(result.notes[0]).toMatchObject({
    word: "語", reading: "ご", meaning: "word; language",
    pictureFilename: "word.webp", wordAudioFilename: "word.mp3",
    sentenceAudioFilename: "sentence.mp3",
  });
  expect(result.cards[0].memoryState).toEqual({ stability: 12.5, difficulty: 6.2 });
  expect(result.reviews).toHaveLength(1);
});
```

Add tests for missing required fields, duplicate note/card IDs, empty optional fields, malformed card JSON, HTML script/event attributes, remote image URLs, and the SQLite `unicase` collation not being registered.

- [ ] **Step 3: Verify the collection test fails**

```powershell
npx vitest run src/features/import/collection-reader.test.ts
```

Expected: FAIL with an unresolved collection-reader import.

- [ ] **Step 4: Implement read-only collection normalization**

Read all deck/notetype/field rows without relying on SQLite's Anki-only `unicase` collation. Match deck and notetype names in JavaScript with Unicode normalization. Split note fields on `\x1f`, map by field ordinal, and parse `[sound:filename]` plus local `<img src>` references.

Use DOMPurify with this display allowlist:

```ts
export const DISPLAY_TAGS = ["b", "br", "em", "i", "span", "strong"] as const;
export const DISPLAY_ATTRS: string[] = [];
```

Store pictures as media IDs rather than retaining `<img>` markup. Never retain inline `style`, event attributes, `iframe`, `script`, or a remote URL.

- [ ] **Step 5: Run collection and regression checks**

```powershell
npx vitest run src/features/import/collection-reader.test.ts
npm run typecheck
npm run test:run
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit collection normalization**

```powershell
git add src/features/import tests/fixtures
git commit -m "feat: normalize Kaishi collection data"
```

### Task 5: Import deck content and media atomically in a Web Worker

**Files:**
- Create: `src/features/import/import-service.ts`
- Create: `src/features/import/import-worker.ts`
- Create: `src/features/import/import-client.ts`
- Create: `src/features/import/import-service.test.ts`
- Create: `src/features/import/ImportPage.tsx`
- Create: `src/features/import/ImportPage.test.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Produces: `importPackage(input: ImportRequest, deps: ImportDependencies): Promise<ImportReport>`.
- Produces: `createImportClient(): ImportClient` with `start`, `cancel`, and typed progress events.
- Consumes: Task 3 `PackageReader`, Task 4 `NormalizedCollection`, and Task 2 `KaishiDb`.

- [ ] **Step 1: Write failing atomic-import and UI tests**

```ts
it("keeps the previous active deck when a media write fails", async () => {
  await seedActiveDeck(db, "existing");
  mediaWriter.failOnFilename("sentence.mp3");
  await expect(importPackage(request, deps)).rejects.toThrow("sentence.mp3");
  expect(await getActiveDeckId(db)).toBe("existing");
  expect(await db.decks.get("incoming")).toBeUndefined();
});
```

```tsx
it("states that import stays on this device", () => {
  render(<ImportPage />);
  expect(screen.getByText(/processed locally/i)).toBeVisible();
  expect(screen.getByLabelText(/anki package/i)).toHaveAttribute("accept", ".apkg,.colpkg");
});
```

- [ ] **Step 2: Verify both tests fail**

```powershell
npx vitest run src/features/import/import-service.test.ts src/features/import/ImportPage.test.tsx
```

Expected: FAIL because import service and page do not exist.

- [ ] **Step 3: Implement the staged import contract**

```ts
export type ImportStage =
  | "validate-package" | "read-collection" | "map-notes"
  | "decode-media" | "write-database" | "complete";

export interface ImportProgress {
  stage: ImportStage;
  completed: number;
  total: number;
  message: string;
}

export interface ImportReport {
  importId: string;
  deckId: string;
  notes: number;
  cards: number;
  images: number;
  audio: number;
  reviews: number;
  reviewedCards: number;
  schedulingAvailable: boolean;
  warnings: string[];
}
```

Write imported records under a new deck ID. In the final Dexie transaction, set `settings.activeDeckId` only after required note/media validation succeeds. On failure, delete the incoming deck's staged records without touching the active deck.

- [ ] **Step 4: Emit worker progress without blocking React**

Send progress after every 100 processed entries or 250 ms, whichever happens first. Transfer `ArrayBuffer` values where possible. Cancel by checking `AbortSignal` between entries and before each transaction chunk.

- [ ] **Step 5: Run import, type, build and full tests**

```powershell
npx vitest run src/features/import/import-service.test.ts src/features/import/ImportPage.test.tsx
npm run typecheck
npm run build
npm run test:run
```

Expected: all commands exit 0 and Vite emits a separate worker asset.

- [ ] **Step 6: Commit the import flow**

```powershell
git add src/features/import src/app/App.tsx
git commit -m "feat: import Kaishi packages in a worker"
```

## Phase 2 — Vocabulary scheduling and typed review

### Task 6: Add the pinned FSRS adapter and deterministic transition tests

**Files:**
- Create: `src/features/study/scheduler.ts`
- Create: `src/features/study/scheduler.test.ts`
- Create: `src/features/study/scheduler-fixtures.ts`

**Interfaces:**
- Produces: `createScheduler(config: SchedulerConfig): Scheduler` from the spec.
- Produces: `createNewSchedule(skillCardId: string, now: Date): ScheduleRecord`.
- Produces: `toFsrsCard` and `fromFsrsCard` only inside this module.

- [ ] **Step 1: Record the installed scheduler version in the adapter test**

```ts
it("uses the exact installed scheduler version in every transition", () => {
  const scheduler = createScheduler(DEFAULT_SCHEDULER_CONFIG);
  const before = createNewSchedule("note:reading", new Date("2026-09-05T00:00:00Z"));
  const result = scheduler.answer(before, "good", new Date("2026-09-05T00:00:00Z"));
  expect(result.next.scheduler).toBe("ts-fsrs");
  expect(result.next.schedulerVersion).toMatch(/^\d+\.\d+\.\d+/);
  expect(result.next.revision).toBe(1);
});
```

Add fixed-date golden tests for all four ratings from New, Learning, Review, and Relearning states. Assert monotonic intervals for Again <= Hard <= Good <= Easy where the upstream scheduler returns day intervals.

- [ ] **Step 2: Verify the scheduler tests fail**

```powershell
npx vitest run src/features/study/scheduler.test.ts
```

Expected: FAIL because `scheduler.ts` does not exist.

- [ ] **Step 3: Implement the only direct `ts-fsrs` import in the app**

```ts
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  desiredRetention: 0.90,
  maximumIntervalDays: 36_500,
  enableFuzz: true,
  enableShortTerm: true,
  learningSteps: ["1m", "10m"],
  relearningSteps: ["10m"],
};
```

Map Kaishi string ratings to upstream numeric ratings explicitly. Hash canonical JSON parameters with SHA-256 and store the hash on each schedule. Increment `revision` on every answer.

- [ ] **Step 4: Run scheduler and full checks**

```powershell
npx vitest run src/features/study/scheduler.test.ts
npm run typecheck
npm run test:run
```

Expected: all commands exit 0 and the golden schedule snapshots are stable.

- [ ] **Step 5: Commit the FSRS adapter**

```powershell
git add src/features/study
git commit -m "feat: add deterministic FSRS adapter"
```

### Task 7: Implement Fresh and Continue schedule initialization

**Files:**
- Create: `src/features/import/progress-initializer.ts`
- Create: `src/features/import/progress-initializer.test.ts`
- Create: `src/features/import/ProgressChoice.tsx`
- Create: `src/features/import/ProgressChoice.test.tsx`
- Modify: `src/features/import/ImportPage.tsx`

**Interfaces:**
- Produces: `initializeProgress(request: ProgressInitRequest, db: KaishiDb): Promise<ProgressInitReport>`.
- Produces: `seedFromAnkiCard(card: ImportedAnkiCard, skillCardId: string, importedAt: Date): ScheduleRecord`.
- Consumes: Task 6 `createNewSchedule`.

- [ ] **Step 1: Write failing Fresh/Continue tests**

```ts
it("creates two new skill schedules per note in Fresh mode", async () => {
  const report = await initializeProgress({ deckId, mode: "fresh", now }, db);
  expect(report.skillCardsCreated).toBe(4);
  expect(await db.schedules.where("state").equals("new").count()).toBe(4);
  expect(await db.ankiReviews.count()).toBe(0);
});

it("seeds both skills and stores imported reviews once in Continue mode", async () => {
  const report = await initializeProgress({ deckId, mode: "continue", now }, db);
  expect(report.seededSchedules).toBe(2);
  expect((await db.schedules.toArray()).every((x) => x.seededFromAnki)).toBe(true);
  expect(await db.ankiReviews.count()).toBe(1);
});
```

Add tests that Continue is rejected when scheduling is absent, invalid stability/difficulty falls back to a New schedule with a warning, and repeated initialization is idempotent.

- [ ] **Step 2: Verify the tests fail**

```powershell
npx vitest run src/features/import/progress-initializer.test.ts src/features/import/ProgressChoice.test.tsx
```

Expected: FAIL because the initializer and choice component do not exist.

- [ ] **Step 3: Implement explicit progress choice behavior**

Fresh mode creates `reading` and `meaning` skill cards and New schedules at the import timestamp. Continue mode converts Anki state, due, interval, repetitions, lapses, stability, difficulty, and last review into two baseline schedules. It stores Anki revlog rows in `ankiReviews` once and records `seededFromAnki: true` on the two schedules.

The UI must disable Continue with the message `Export the deck from Anki with scheduling information, then import that package.` when scheduling is absent.

- [ ] **Step 4: Run initialization, type and full tests**

```powershell
npx vitest run src/features/import/progress-initializer.test.ts src/features/import/ProgressChoice.test.tsx
npm run typecheck
npm run test:run
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit progress initialization**

```powershell
git add src/features/import
git commit -m "feat: support fresh and Anki continuation modes"
```

### Task 8: Build the due queue with limits and sibling separation

**Files:**
- Create: `src/features/study/queue.ts`
- Create: `src/features/study/queue.test.ts`

**Interfaces:**
- Produces: `buildStudyQueue(input: QueueInput): SkillCardId[]`.
- Consumes: schedules, skill cards, daily counts, timezone, limits, and a deterministic seed.

- [ ] **Step 1: Write failing ordering tests**

```ts
it("orders learning before review before new and separates sibling skills", () => {
  const ids = buildStudyQueue(fixtureQueueInput({ seed: "2026-09-05:local" }));
  expect(ids.slice(0, 3)).toEqual(["learning:reading", "review-a:reading", "review-b:reading"]);
  expect(adjacentIdsShareNote(ids)).toBe(false);
});
```

Add tests for local-day rollover, review limit 200, new limit 20, overdue sorting, lower-retrievability tie breaking, stable results for the same seed, and changed ordering for a different day seed.

- [ ] **Step 2: Verify queue tests fail**

```powershell
npx vitest run src/features/study/queue.test.ts
```

Expected: FAIL because `queue.ts` does not exist.

- [ ] **Step 3: Implement pure queue construction**

```ts
export interface QueueLimits { newPerDay: number; reviewsPerDay: number }
export interface QueueInput {
  now: Date;
  timezone: string;
  schedules: ScheduleRecord[];
  skillCards: SkillCardRecord[];
  completedToday: { newCards: number; reviews: number };
  limits: QueueLimits;
  seed: string;
}
```

Use a hash-based seeded tie-breaker; do not call `Math.random()`. After primary sorting, make one linear pass that swaps an adjacent sibling with the next non-sibling when available.

- [ ] **Step 4: Run queue and full tests**

```powershell
npx vitest run src/features/study/queue.test.ts
npm run typecheck
npm run test:run
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the due queue**

```powershell
git add src/features/study/queue.ts src/features/study/queue.test.ts
git commit -m "feat: add deterministic due queue"
```

### Task 9: Replace heuristic grading with tested reading and English graders

**Files:**
- Create: `src/features/study/grading/types.ts`
- Create: `src/features/study/grading/kana-romaji.ts`
- Create: `src/features/study/grading/reading.ts`
- Create: `src/features/study/grading/english.ts`
- Create: `src/features/study/grading/reading.test.ts`
- Create: `src/features/study/grading/english.test.ts`

**Interfaces:**
- Produces: `gradeReading(answer: string, acceptedReadings: string[]): GradeResult`.
- Produces: `deriveEnglishAliases(gloss: string): string[]`.
- Produces: `gradeEnglish(answer: string, aliases: string[]): GradeResult`.
- `GradeResult` is `{ grade, normalizedAnswer, matchedAlias?, suggestedRating, reason }`.

- [ ] **Step 1: Port the existing useful reading cases into real assertions**

```ts
it.each([
  ["がっこう", "がっこう"], ["gakkou", "がっこう"], ["gakkō", "がっこう"],
  ["スーパー", "スーパー"], ["suupaa", "スーパー"], ["しんよう", "しんよう"],
])("accepts %s for %s", (answer, reading) => {
  expect(gradeReading(answer, [reading]).grade).toBe("correct");
});
```

Add negative cases that distinguish small `っ` from `つ`, `じ` from `ぢ` when no accepted alias exists, and empty input from a valid answer.

- [ ] **Step 2: Write conservative English grading tests**

```ts
it("accepts an explicit gloss alias", () => {
  const aliases = deriveEnglishAliases("word; language (general)");
  expect(gradeEnglish("language", aliases).grade).toBe("correct");
});

it("does not mark keyword overlap as correct", () => {
  const aliases = deriveEnglishAliases("to take a photograph");
  expect(gradeEnglish("take", aliases).grade).toBe("close");
});

it("treats one bounded typo as close, not silently exact", () => {
  expect(gradeEnglish("langauge", ["language"]).grade).toBe("close");
});
```

- [ ] **Step 3: Verify both grader suites fail**

```powershell
npx vitest run src/features/study/grading
```

Expected: FAIL because the grader modules do not exist.

- [ ] **Step 4: Implement normalization and explicit rating suggestions**

Use NFKC, lowercase English, punctuation folding, collapsed whitespace, a fixed romaji variant table, and bounded Damerau-Levenshtein distance. Map `incorrect -> again`, `close -> hard`, and `correct -> good`; never suggest `easy`.

- [ ] **Step 5: Run graders and full tests**

```powershell
npx vitest run src/features/study/grading
npm run typecheck
npm run test:run
```

Expected: all commands exit 0; delete no legacy tests yet.

- [ ] **Step 6: Commit the graders**

```powershell
git add src/features/study/grading
git commit -m "feat: add deterministic typed-answer grading"
```

### Task 10: Make answer confirmation an atomic study-session operation

**Files:**
- Create: `src/features/study/study-session.ts`
- Create: `src/features/study/study-session.test.ts`
- Modify: `src/storage/repositories.ts`

**Interfaces:**
- Produces: `createStudySession(deps: StudySessionDependencies): StudySession`.
- Produces: `loadNext(): Promise<StudyPrompt | undefined>`.
- Produces: `submitAnswer(answer: string, responseMs: number): GradeResult`.
- Produces: `confirmRating(rating: Rating): Promise<StudyPrompt | undefined>`.

- [ ] **Step 1: Write the failing transaction test**

```ts
it("writes event, schedule and daily count in one transaction", async () => {
  const session = createStudySession(deps);
  await session.loadNext();
  session.submitAnswer("gakkou", 1400);
  await session.confirmRating("good");
  expect(await db.reviewEvents.count()).toBe(1);
  expect((await db.schedules.get(cardId))?.revision).toBe(1);
  expect((await db.dailyActivity.get("local:2026-09-05"))?.vocabularyReviews).toBe(1);
});
```

Add cases for rating before reveal, double confirmation, stale schedule revision, transaction failure, and browser refresh after answer submission but before rating confirmation.

- [ ] **Step 2: Verify the session tests fail**

```powershell
npx vitest run src/features/study/study-session.test.ts
```

Expected: FAIL because `study-session.ts` does not exist.

- [ ] **Step 3: Implement optimistic concurrency and the answer transaction**

Load the prompt with `scheduleRevision`. In `confirmRating`, open one Dexie `rw` transaction across schedules, reviewEvents, and dailyActivity; re-read the schedule and throw `ScheduleConflictError` when the revision differs. Generate event IDs with `crypto.randomUUID()` and store the local date plus IANA timezone.

- [ ] **Step 4: Run session and full checks**

```powershell
npx vitest run src/features/study/study-session.test.ts
npm run typecheck
npm run test:run
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the session service**

```powershell
git add src/features/study src/storage/repositories.ts
git commit -m "feat: persist vocabulary reviews atomically"
```

### Task 11: Build the Anki-like typed vocabulary interface and media lifecycle

**Files:**
- Create: `src/features/study/StudyPage.tsx`
- Create: `src/features/study/StudyPage.test.tsx`
- Create: `src/features/study/components/PromptCard.tsx`
- Create: `src/features/study/components/AnswerFeedback.tsx`
- Create: `src/features/study/components/RatingBar.tsx`
- Create: `src/features/media/media-repository.ts`
- Create: `src/features/media/useMediaUrl.ts`
- Create: `src/features/media/useMediaUrl.test.tsx`
- Create: `src/features/media/AudioButton.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: Task 10 `StudySession` and Task 2 media records.
- Produces: a keyboard-first review screen with answer, reveal, media, interval previews and rating confirmation.

- [ ] **Step 1: Write the failing review interaction test**

```tsx
it("requires a typed answer before enabling rating buttons", async () => {
  render(<StudyPage session={fakeSession} />);
  expect(screen.getByRole("button", { name: /good/i })).toBeDisabled();
  await user.type(screen.getByLabelText(/your answer/i), "language");
  await user.click(screen.getByRole("button", { name: /check/i }));
  expect(screen.getByText(/canonical answer/i)).toBeVisible();
  expect(screen.getByRole("button", { name: /good/i })).toBeEnabled();
});
```

Add tests for shortcuts 1–4 only after reveal, loading an empty queue, close-answer messaging, schedule conflict messaging, and no color-only correctness signal.

- [ ] **Step 2: Write the failing object-URL cleanup test**

```tsx
it("revokes the previous media URL when the card changes", async () => {
  const revoke = vi.spyOn(URL, "revokeObjectURL");
  const view = render(<MediaHarness mediaId="first" />);
  view.rerender(<MediaHarness mediaId="second" />);
  expect(revoke).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: Verify UI/media tests fail**

```powershell
npx vitest run src/features/study/StudyPage.test.tsx src/features/media/useMediaUrl.test.tsx
```

Expected: FAIL because the components do not exist.

- [ ] **Step 4: Implement the review states**

Render exactly three view states: loading, prompt, and revealed answer. Do not render deck HTML with `dangerouslySetInnerHTML` except through the sanitized display-fragment component. Keep image, Word Audio and Sentence Audio unavailable states visible but non-blocking.

Before reveal show word, optional picture, skill label and answer field. After reveal show the canonical reading/meaning, sentence, sentence meaning, furigana, pitch accent, notes, audio buttons and four interval previews.

- [ ] **Step 5: Run UI, type, build and full tests**

```powershell
npx vitest run src/features/study/StudyPage.test.tsx src/features/media/useMediaUrl.test.tsx
npm run typecheck
npm run build
npm run test:run
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit the vocabulary UI**

```powershell
git add src/features/study src/features/media src/app/App.tsx src/styles/app.css
git commit -m "feat: add typed vocabulary review interface"
```

## Phase 3 — Kana Trainer, dashboard and release hardening

### Task 12: Implement the independent Kana Trainer domain and UI

**Files:**
- Create: `src/features/kana/kana-catalog.ts`
- Create: `src/features/kana/kana-grader.ts`
- Create: `src/features/kana/kana-session.ts`
- Create: `src/features/kana/kana-session.test.ts`
- Create: `src/features/kana/KanaPage.tsx`
- Create: `src/features/kana/KanaPage.test.tsx`
- Create: `src/features/kana/StrokeOrder.tsx`
- Create: `scripts/extract-kana-strokes.mjs`
- Create: `public/kana-strokes/NOTICE.md`
- Modify: `src/app/App.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Produces: `KANA_CATALOG: readonly KanaEntry[]`.
- Produces: `gradeKana(answer: string, entry: KanaEntry): KanaGrade`.
- Produces: `createKanaSession(config, repository): KanaSession`.

- [ ] **Step 1: Write the catalog and mastery tests**

```ts
it("covers both scripts, marks and combinations with unique ids", () => {
  expect(new Set(KANA_CATALOG.map((x) => x.id)).size).toBe(KANA_CATALOG.length);
  expect(KANA_CATALOG.some((x) => x.kana === "あ" && x.group === "basic")).toBe(true);
  expect(KANA_CATALOG.some((x) => x.kana === "ガ" && x.group === "dakuten")).toBe(true);
  expect(KANA_CATALOG.some((x) => x.kana === "きゃ" && x.group === "yoon")).toBe(true);
});

it("prioritizes recent mistakes in focus mode", async () => {
  await repository.record(wrongAttempt("hiragana:ぬ", now));
  const prompt = await createKanaSession({ mode: "focus", seed: "fixed" }, repository).next();
  expect(prompt.id).toBe("hiragana:ぬ");
});
```

- [ ] **Step 2: Write the failing selection UI test**

```tsx
it("starts a hiragana basic-row session and updates shared activity", async () => {
  render(<KanaPage repository={repository} />);
  await user.click(screen.getByRole("checkbox", { name: /hiragana basic/i }));
  await user.click(screen.getByRole("button", { name: /start/i }));
  await user.type(screen.getByLabelText(/romaji/i), "a");
  await user.keyboard("{Enter}");
  expect((await db.dailyActivity.get("local:2026-09-05"))?.kanaAttempts).toBe(1);
});
```

- [ ] **Step 3: Verify Kana tests fail**

```powershell
npx vitest run src/features/kana
```

Expected: FAIL because Kana modules do not exist.

- [ ] **Step 4: Implement deterministic Kana sessions**

Support `basic`, `dakuten`, `handakuten`, and `yoon` groups for hiragana and katakana. Accept explicit standard variants such as `shi/si`, `chi/ti`, `tsu/tu`, `fu/hu`, `ji/zi`, and `wo/o`. Use the same seeded shuffle helper as the vocabulary queue. Persist attempts, correct count, streak, last wrong timestamp, and rolling mean response time.

- [ ] **Step 5: Add attributed stroke-order assets**

Use the official release `r20250816` at `https://github.com/KanjiVG/kanjivg/releases/download/r20250816/kanjivg-20250816-main.zip`. On the first reviewed download, compute SHA-256, paste the 64-character digest into `scripts/extract-kana-strokes.mjs`, and rerun the script so it refuses any byte mismatch before extracting. Extract only catalog code points and generate optimized SVGs without scripts or external references. `NOTICE.md` must name KanjiVG, link the project, state CC BY-SA 3.0, record release `r20250816`, and state that the assets were modified into a subset.

The app uses `speechSynthesis` only when a `ja-JP` voice is available and exposes `Pronunciation unavailable on this device` otherwise.

- [ ] **Step 6: Run Kana, license, type and full tests**

```powershell
npx vitest run src/features/kana
npm run typecheck
npm run test:run
Test-Path public\kana-strokes\NOTICE.md
```

Expected: test/type commands exit 0 and the final command prints `True`.

- [ ] **Step 7: Commit Kana Trainer**

```powershell
git add src/features/kana public/kana-strokes scripts/extract-kana-strokes.mjs src/app/App.tsx src/styles/app.css
git commit -m "feat: add independent Kana Trainer"
```

### Task 13: Add dashboard aggregates without duplicating imported history

**Files:**
- Create: `src/features/dashboard/dashboard-service.ts`
- Create: `src/features/dashboard/dashboard-service.test.ts`
- Create: `src/features/dashboard/DashboardPage.tsx`
- Create: `src/features/dashboard/DashboardPage.test.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Produces: `loadDashboard(now: Date, timezone: string): Promise<DashboardModel>`.
- Produces: due counts, today's counts, current streak, activity cells, vocabulary accuracy, and Kana weak items.

- [ ] **Step 1: Write the failing aggregation test**

```ts
it("counts imported Anki reviews once and new skill reviews by event", async () => {
  await seedOneImportedAnkiReview(db);
  await seedTwoKaishiSkillReviews(db);
  const model = await service.loadDashboard(now, "Asia/Bangkok");
  expect(model.lifetimeVocabularyReviews).toBe(3);
  expect(model.today.vocabularyReviews).toBe(2);
});
```

Add tests for a Bangkok midnight boundary, consecutive-day streak, skipped day, Kana attempts not affecting vocabulary accuracy, and 26-week heatmap bounds.

- [ ] **Step 2: Verify dashboard tests fail**

```powershell
npx vitest run src/features/dashboard
```

Expected: FAIL because dashboard modules do not exist.

- [ ] **Step 3: Implement query-only dashboard aggregation**

Use IndexedDB indexes for date ranges. Imported revlogs contribute to lifetime/history once through `ankiReviews`; they do not become `reviewEvents`. Current-day counts come from `dailyActivity`. Render heatmap cells as accessible buttons with date/count labels.

- [ ] **Step 4: Run dashboard and full tests**

```powershell
npx vitest run src/features/dashboard
npm run typecheck
npm run test:run
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the dashboard**

```powershell
git add src/features/dashboard src/app/App.tsx
git commit -m "feat: add shared study dashboard"
```

### Task 14: Add progress backup, restore and scoped reset

**Files:**
- Create: `src/storage/backup.ts`
- Create: `src/storage/backup.test.ts`
- Create: `src/features/settings/SettingsPage.tsx`
- Create: `src/features/settings/SettingsPage.test.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Produces: `exportProgress(db: KaishiDb): Promise<Blob>`.
- Produces: `validateProgressBackup(value: unknown): ProgressBackupV1`.
- Produces: `restoreProgress(db: KaishiDb, backup: ProgressBackupV1): Promise<void>`.
- Produces: `resetData(db, scope: "session" | "progress" | "all"): Promise<void>`.

- [ ] **Step 1: Write failing backup round-trip tests**

```ts
it("round-trips progress without embedding deck media", async () => {
  await seedProgressAndMedia(sourceDb);
  const blob = await exportProgress(sourceDb);
  expect(await blob.text()).not.toContain("data:audio");
  await restoreProgress(targetDb, JSON.parse(await blob.text()));
  expect(await targetDb.reviewEvents.count()).toBe(1);
  expect(await targetDb.media.count()).toBe(0);
});
```

Add invalid schema version, package-hash mismatch, failed restore rollback, progress-only reset preserving notes/media, and all-data reset tests.

- [ ] **Step 2: Verify backup/settings tests fail**

```powershell
npx vitest run src/storage/backup.test.ts src/features/settings/SettingsPage.test.tsx
```

Expected: FAIL because backup and settings modules do not exist.

- [ ] **Step 3: Implement canonical JSON backup and transactional restore**

Set top-level backup fields to `schemaVersion`, `exportedAt`, `deckId`, `packageSha256`, `settings`, `schedules`, `reviewEvents`, `ankiReviews`, `kanaSkills`, and `dailyActivity`. Sort every record array by primary key before serialization. Restore into staging arrays, validate every record, then replace progress tables in one transaction.

Show an export action before every destructive reset or restore confirmation.

- [ ] **Step 4: Run backup and full tests**

```powershell
npx vitest run src/storage/backup.test.ts src/features/settings/SettingsPage.test.tsx
npm run typecheck
npm run test:run
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit backup and reset controls**

```powershell
git add src/storage/backup.ts src/storage/backup.test.ts src/features/settings src/app/App.tsx
git commit -m "feat: add local progress backup and reset"
```

### Task 15: Make the app installable and prove offline behavior

**Files:**
- Modify: `vite.config.ts`
- Create: `public/manifest.webmanifest`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `scripts/generate-pwa-icons.mjs`
- Create: `src/app/UpdatePrompt.tsx`
- Create: `tests/e2e/offline.spec.ts`
- Create: `playwright.config.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: scripts `test:e2e` and `test:e2e:ui`.
- Produces: a service worker that precaches only application/open-licensed static assets.

- [ ] **Step 1: Install exact-pinned PWA and browser-test dependencies**

```powershell
npm install --save-dev --save-exact vite-plugin-pwa @playwright/test axe-core sharp
npx playwright install chromium
```

- [ ] **Step 2: Write the failing offline reload test**

```ts
test("reopens the shell offline after first load", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kaishi Drill" })).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("link", { name: /kana trainer/i })).toBeVisible();
});
```

- [ ] **Step 3: Verify the test fails before PWA configuration**

```powershell
npm run build
npx playwright test tests/e2e/offline.spec.ts
```

Expected: FAIL waiting for a controlling service worker.

- [ ] **Step 4: Configure app-shell-only caching and safe updates**

Exclude `*.apkg`, `*.colpkg`, database exports, and imported media from service-worker patterns. Use `registerType: "prompt"`; show UpdatePrompt only after the current review transaction is idle. Do not call `skipWaiting` during an active answer.

Generate both PNG icons from a deterministic 512x512 SVG in `scripts/generate-pwa-icons.mjs`: warm off-white background, centered dark `改` glyph converted to paths or rendered with the repository's pinned font, and no imported deck art. Use `sharp` to write exact 192x192 and 512x512 outputs, then run:

```powershell
node scripts/generate-pwa-icons.mjs
```

- [ ] **Step 5: Run PWA and full checks**

```powershell
npm run build
npx playwright test tests/e2e/offline.spec.ts
npm run typecheck
npm run test:run
```

Expected: all commands exit 0 and the offline reload succeeds.

- [ ] **Step 6: Commit PWA support**

```powershell
git add vite.config.ts public src/app/UpdatePrompt.tsx tests/e2e playwright.config.ts scripts/generate-pwa-icons.mjs package.json package-lock.json
git commit -m "feat: make Kaishi Drill installable offline"
```

### Task 16: Run end-to-end security, accessibility and private-deck acceptance

**Files:**
- Create: `tests/e2e/import-study.spec.ts`
- Create: `tests/e2e/kana.spec.ts`
- Create: `tests/e2e/accessibility.spec.ts`
- Create: `docs/acceptance/private-deck-checklist.md`
- Modify: `README.md`
- Modify: `package.json`

**Interfaces:**
- Produces: a documented, reproducible release gate.
- Consumes: the complete app and synthetic package fixture.

- [ ] **Step 1: Add a complete synthetic import-to-review browser test**

```ts
test("imports, chooses Fresh, reviews, reloads and preserves progress", async ({ page }) => {
  await page.goto("/import");
  await page.getByLabel(/anki package/i).setInputFiles("test-results/fixtures/synthetic-kaishi.apkg");
  await page.getByRole("button", { name: /start fresh/i }).click();
  await page.getByRole("link", { name: /vocabulary/i }).click();
  await page.getByLabel(/your answer/i).fill("go");
  await page.getByRole("button", { name: /check/i }).click();
  await page.getByRole("button", { name: /good/i }).click();
  await page.reload();
  await expect(page.getByText(/1 review today/i)).toBeVisible();
});
```

Add Continue-mode history, malicious note markup, missing media, duplicate-tab conflict, Kana focus mode, keyboard shortcuts, axe-core critical violations, reduced motion, and backup/restore browser cases.

- [ ] **Step 2: Add the non-sensitive private-deck checklist**

```markdown
# Private Kaishi deck acceptance

- [ ] Import completes without network requests carrying package data.
- [ ] Report shows 1,501 notes.
- [ ] Report shows 1,382 images and 2,972 audio files.
- [ ] Media-reference warning counts match the verified optional-field gaps.
- [ ] Fresh mode creates no imported due schedules.
- [ ] Continue mode recognizes 100 reviewed-card baselines and 383 historical reviews.
- [ ] Word image, word audio and sentence audio open on sampled notes.
- [ ] A completed review survives reload and browser restart.
- [ ] Exported progress restores into a clean browser profile.
- [ ] No package, database, extracted media or private report appears in `git status`.
```

- [ ] **Step 3: Rewrite README around the supported app, privacy and local workflow**

Document Node >=20, `npm ci`, `npm run dev`, `npm run test:run`, `npm run test:e2e`, `npm run build`, package export requirements, Fresh versus Continue semantics, English-only grading, Kana module boundaries, backup procedure, known absence of Anki write-back/cloud sync, and the preserved legacy prototype.

- [ ] **Step 4: Run the full automated release gate**

```powershell
npm ci
npm run fixture:apkg
npm run typecheck
npm run test:run
npm run build
npm run test:e2e
```

Expected: every command exits 0.

- [ ] **Step 5: Run the private-deck checklist locally**

Serve the production build, import the user's scheduling-inclusive package through the UI, record pass/fail only in `private-reports/kaishi-acceptance.md`, and confirm that directory remains ignored.

```powershell
npm run preview
git status --short
```

Expected: every checklist item passes; `git status --short` does not list an Anki package, database, extracted media, or private report. If a count differs, stop the cutover and attach the non-sensitive count mismatch to the issue report.

- [ ] **Step 6: Inspect the production bundle and preserved rollback path**

```powershell
Get-ChildItem dist -Recurse -File | Measure-Object Length -Sum
git diff --exit-code -- kaishi_drill.html kaishi_drill_template.html build_final_html.py data/sample_items_audio.json
```

Expected: the bundle exists; the second command exits 0, confirming that the legacy prototype remains an immediate rollback option.

- [ ] **Step 7: Commit release documentation and end-to-end tests**

```powershell
git add tests/e2e docs/acceptance README.md package.json package-lock.json
git commit -m "test: add Kaishi web app release gate"
```

## Phase 4 — Windows follow-up after browser approval

Do not begin this phase until the product owner approves the browser release. At that point, write a separate Tauri 2 design spec and implementation plan. The new plan must preserve the domain interfaces in this document, replace only platform adapters where necessary, and test migration from browser progress backup into the Windows app.

## Final verification for this implementation plan

```powershell
git status --short
git log --oneline --decorate -20
npm ci
npm run typecheck
npm run test:run
npm run build
npm run test:e2e
```

Expected final state: a clean worktree; all checks pass; no private Anki data is tracked; the current prototype remains available; the browser app satisfies every acceptance item in the design spec.
