# Private Kaishi deck acceptance

Run this checklist locally against a production build. Record only pass/fail and non-sensitive counts in `private-reports/kaishi-acceptance.md`; that directory is ignored by Git. Never copy the package, database, note text, extracted media or browser profile into the repository.

## Preparation

- [ ] Export the Kaishi 1.5k package from Anki with media and scheduling information.
- [ ] Run `npm ci`, `npm run test:run`, `npm run build` and `npm run test:e2e`; every command exits 0.
- [ ] Run `npm run preview` and use the production URL printed by Vite.
- [ ] Open browser developer tools and preserve the Network log before choosing the package.

## Import and privacy

- [ ] Import completes without a network request carrying package data.
- [ ] The report shows 1,501 notes.
- [ ] The report shows 1,382 images and 2,972 audio files.
- [ ] Media-reference warning counts match the verified optional-field gaps.
- [ ] No unexpected remote URL from note markup is requested.

## Fresh and Continue

- [ ] Fresh mode creates no imported due schedules or imported review history.
- [ ] Continue from Anki is disabled for the verified package because all 1,501 cards are New and the package contains no review log.
- [ ] Fresh mode creates 3,000 study cards from 1,500 vocabulary notes; the informational welcome note is retained but excluded from drills.
- [ ] The first study word is `私`, confirming that the package New-card position is preserved (including the source gap at position 1,380).
- [ ] Reading and English-meaning schedules remain independent for the same note.
- [ ] Due, new-card and lifetime dashboard totals match the selected mode.
- [ ] Settings defaults to 20 New cards and 200 maximum reviews per day; saved custom limits survive reload.
- [ ] Future Due shows exactly the next 14 local calendar days and states that new answers can change the estimate.

## Review and media sampling

- [ ] Typed reading accepts kana and supported romaji variants on sampled notes.
- [ ] Typed English meaning grades correct, close and incorrect samples conservatively; `恋人` accepts both `lover` and `sweetheart`.
- [ ] `迎える` accepts each listed alternative independently: `welcome`, `go out to meet`, and `invite`, with or without a leading `to`.
- [ ] The sentence, word audio and sentence audio are present before an answer is submitted on sampled notes that contain each field.
- [ ] Word image, word audio and sentence audio open on sampled notes that contain each asset.
- [ ] Missing optional media shows an explicit unavailable state without blocking review.
- [ ] A completed review survives reload and a full browser restart.
- [ ] Two tabs rating the same stale prompt produce a conflict instead of a duplicate review.

## Kana and accessibility

- [ ] Hiragana and Katakana group selection works for Basic, Dakuten, Handakuten and Yōon.
- [ ] Focus mode starts with recent mistakes and records mastery separately from vocabulary FSRS.
- [ ] A correct Kana answer submitted with Enter advances immediately; a wrong answer reveals the accepted answer and the next Enter advances.
- [ ] Keyboard-only review, visible focus and the skip link work.
- [ ] Reduced-motion mode removes non-essential motion.
- [ ] The dashboard, import, study, Kana and settings views have no critical axe violations.

## Backup and offline behavior

- [ ] Exported progress restores into a clean browser profile after the same package is imported and initialized.
- [ ] The restored review count, due state, activity and Kana mastery match the source profile.
- [ ] After one online production load, the app shell reopens offline.
- [ ] An available app update waits until the current typed answer/review transaction is idle.

## Repository hygiene and rollback

- [ ] No package, Anki database, extracted deck media or private report appears in `git status --short`.
- [ ] `private-data/` and `private-reports/` remain ignored.
- [ ] `kaishi_drill.html`, `kaishi_drill_template.html`, `build_final_html.py` and `data/sample_items_audio.json` are unchanged from the last approved baseline.
- [ ] The production `dist/` exists and is ignored.

If an expected count differs, stop the release cutover and record only the mismatched counts and app version in the private report.
