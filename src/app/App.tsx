import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";

const ImportPage = lazy(() =>
  import("../features/import/ImportPage").then((module) => ({ default: module.ImportPage })),
);

function Home() {
  return (
    <section>
      <p className="eyebrow">Offline-first Japanese study</p>
      <h1>Kaishi Drill</h1>
      <p className="lede">
        Import a Kaishi Anki package to study vocabulary locally, or use the Kana Trainer
        independently.
      </p>
    </section>
  );
}

export function App() {
  return (
    <AppShell>
      <Suspense fallback={<p role="status">Loading…</p>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/import" element={<ImportPage />} />
          <Route
            path="/study"
            element={
              <section>
                <h1>Vocabulary</h1>
                <p>Import a deck to begin studying.</p>
              </section>
            }
          />
          <Route
            path="/kana"
            element={
              <section>
                <h1>Kana Trainer</h1>
                <p>Kana practice will be available in the next phase.</p>
              </section>
            }
          />
          <Route
            path="/settings"
            element={
              <section>
                <h1>Settings</h1>
              </section>
            }
          />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
