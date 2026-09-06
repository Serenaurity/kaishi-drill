import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { deleteKaishiDb, openKaishiDb } from "../../storage/db";
import { KANA_CATALOG } from "./kana-catalog";
import { KanaPage } from "./KanaPage";
import { createDexieKanaRepository } from "./kana-session";

const databases: string[] = [];
const NOW = new Date("2026-09-05T12:00:00.000Z");

afterEach(async () => {
  await Promise.all(databases.splice(0).map((name) => deleteKaishiDb(name)));
});

it("records a correct Enter submission and advances immediately", async () => {
  const user = userEvent.setup();
  const name = `kana-page-${crypto.randomUUID()}`;
  databases.push(name);
  const db = openKaishiDb(name);
  const repository = createDexieKanaRepository(db, {
    now: () => NOW,
    timezone: () => "Asia/Bangkok",
  });
  render(<KanaPage repository={repository} now={() => NOW} />);
  await user.click(screen.getByRole("checkbox", { name: /hiragana basic/i }));
  await user.click(screen.getByRole("button", { name: /^start$/i }));
  const firstKana = screen.getByText(/./, { selector: "#kana-prompt" }).textContent!;
  const accepted = KANA_CATALOG.find((entry) => entry.kana === firstKana)!.romaji[0]!;
  await user.type(screen.getByLabelText(/romaji/i), accepted);
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.getByText(/./, { selector: "#kana-prompt" })).not.toHaveTextContent(firstKana));
  expect(screen.getByLabelText(/romaji/i)).toHaveValue("");
  expect(screen.getByLabelText(/romaji/i)).toHaveFocus();
  expect(screen.queryByRole("heading", { name: "Correct" })).not.toBeInTheDocument();
  await waitFor(async () => {
    expect((await db.dailyActivity.get("local:2026-09-05"))?.kanaAttempts).toBe(1);
  });
  db.close();
});

it("shows the accepted answer after a mistake and uses Enter again for Next", async () => {
  const user = userEvent.setup();
  const repository = {
    list: async () => [],
    record: async () => ({
      id: "hiragana:あ", attempts: 1, correct: 0, streak: 0,
      lastSeenAt: NOW.toISOString(), lastWrongAt: NOW.toISOString(), meanResponseMs: 500,
    }),
  };
  render(<KanaPage repository={repository} now={() => NOW} />);
  await user.click(screen.getByRole("checkbox", { name: /hiragana basic/i }));
  await user.click(screen.getByRole("button", { name: /^start$/i }));
  const firstKana = screen.getByText(/./, { selector: "#kana-prompt" }).textContent!;
  await user.type(screen.getByLabelText(/romaji/i), "zzz");
  await user.keyboard("{Enter}");

  expect(await screen.findByRole("heading", { name: "Incorrect" })).toBeVisible();
  expect(screen.getByText(/accepted answer/i)).toBeVisible();
  expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Incorrect" })).not.toBeInTheDocument());
  expect(screen.getByText(/./, { selector: "#kana-prompt" })).not.toHaveTextContent(firstKana);
  expect(screen.getByLabelText(/romaji/i)).toHaveFocus();
});

it("keeps pronunciation optional when no Japanese voice is available", () => {
  const repository = {
    list: async () => [],
    record: async () => {
      throw new Error("not used");
    },
  };
  render(<KanaPage repository={repository} speechSynthesisOverride={null} />);
  expect(screen.getByText(/pronunciation unavailable on this device/i)).toBeVisible();
});
