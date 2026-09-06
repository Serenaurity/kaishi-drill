import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SettingsPage, type SettingsActions } from "./SettingsPage";

function actions(): SettingsActions {
  return {
    loadStudyLimits: vi.fn().mockResolvedValue({ newPerDay: 20, reviewsPerDay: 200 }),
    saveStudyLimits: vi.fn().mockResolvedValue(undefined),
    exportBackup: vi.fn().mockResolvedValue(new Blob(["{}"], { type: "application/json" })),
    parseBackup: vi.fn().mockResolvedValue({ schemaVersion: 1 }),
    restoreBackup: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
  };
}

it("shows the recommended Anki limits and saves user changes", async () => {
  const user = userEvent.setup();
  const api = actions();
  render(<SettingsPage actions={api} />);

  const newLimit = await screen.findByLabelText("New cards per day");
  const reviewLimit = screen.getByLabelText("Maximum reviews per day");
  expect(newLimit).toHaveValue(20);
  expect(reviewLimit).toHaveValue(200);
  await user.clear(newLimit);
  await user.type(newLimit, "40");
  await user.clear(reviewLimit);
  await user.type(reviewLimit, "300");
  await user.click(screen.getByRole("button", { name: "Save study limits" }));

  expect(api.saveStudyLimits).toHaveBeenCalledWith({ newPerDay: 40, reviewsPerDay: 300 });
  expect(await screen.findByText("Study limits saved.")).toBeVisible();
});

it("offers the 20 New and 200 Review recommendation", async () => {
  const user = userEvent.setup();
  render(<SettingsPage actions={actions()} />);
  const newLimit = await screen.findByLabelText("New cards per day");
  await user.clear(newLimit);
  await user.type(newLimit, "5");
  await user.click(screen.getByRole("button", { name: /use recommended limits/i }));
  expect(newLimit).toHaveValue(20);
  expect(screen.getByLabelText("Maximum reviews per day")).toHaveValue(200);
});

it("offers a backup action before confirming a progress reset", async () => {
  const user = userEvent.setup();
  const api = actions();
  render(<SettingsPage actions={api} />);
  expect(screen.getByRole("button", { name: /export progress backup/i })).toBeVisible();
  await user.click(screen.getByRole("button", { name: /reset progress/i }));
  expect(screen.getByText(/export a backup before continuing/i)).toBeVisible();
  expect(screen.getAllByRole("button", { name: /export progress backup/i })).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: /confirm reset progress/i }));
  expect(api.reset).toHaveBeenCalledWith("progress");
});

it("validates a selected restore file before showing the final action", async () => {
  const user = userEvent.setup();
  const api = actions();
  render(<SettingsPage actions={api} />);
  await user.upload(screen.getByLabelText(/progress backup file/i), new File(["{}"], "backup.json", { type: "application/json" }));
  expect(await screen.findByRole("button", { name: /confirm restore/i })).toBeVisible();
  expect(api.restoreBackup).not.toHaveBeenCalled();
});
