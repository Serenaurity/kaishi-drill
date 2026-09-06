import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { UpdatePrompt } from "./UpdatePrompt";

const ImportPage = lazy(() =>
  import("../features/import/ImportPage").then((module) => ({ default: module.ImportPage })),
);
const StudyPage = lazy(() =>
  import("../features/study/StudyPage").then((module) => ({ default: module.StudyPage })),
);
const KanaPage = lazy(() =>
  import("../features/kana/KanaPage").then((module) => ({ default: module.KanaPage })),
);
const DashboardPage = lazy(() =>
  import("../features/dashboard/DashboardPage").then((module) => ({ default: module.DashboardPage })),
);
const SettingsPage = lazy(() =>
  import("../features/settings/SettingsPage").then((module) => ({ default: module.SettingsPage })),
);

export function App() {
  return (
    <>
      <AppShell>
        <Suspense fallback={<p role="status">Loading…</p>}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/study" element={<StudyPage />} />
            <Route path="/kana" element={<KanaPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<DashboardPage />} />
          </Routes>
        </Suspense>
      </AppShell>
      <UpdatePrompt />
    </>
  );
}
