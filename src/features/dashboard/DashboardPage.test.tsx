import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import type { DashboardService } from "./dashboard-service";
import { DashboardPage } from "./DashboardPage";

it("shows actionable study counts and accessible activity cells", async () => {
  const service: DashboardService = {
    loadDashboard: async () => ({
      dueVocabulary: 12,
      newVocabularyAvailable: 7,
      lifetimeVocabularyReviews: 321,
      today: { vocabularyReviews: 4, kanaAttempts: 9 },
      streakDays: 6,
      activity: [{ localDate: "2026-09-05", vocabularyReviews: 4, kanaAttempts: 9 }],
      futureDue: [
        { localDate: "2026-09-06", reviews: 8 },
        { localDate: "2026-09-07", reviews: 3 },
      ],
      vocabularyAccuracy: 0.75,
      weakKana: [],
    }),
  };
  render(<MemoryRouter><DashboardPage service={service} now={() => new Date("2026-09-05T12:00:00Z")} /></MemoryRouter>);
  expect(await screen.findByText("12")).toBeVisible();
  expect(screen.getByRole("link", { name: /study vocabulary/i })).toBeVisible();
  expect(screen.getByRole("button", { name: /september 5, 2026.*4 vocabulary reviews.*9 kana attempts/i })).toBeVisible();
  expect(screen.getByText("75%")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Future Due" })).toBeVisible();
  expect(screen.getByText(/scheduled now.*new answers can change/i)).toBeVisible();
  expect(screen.getByLabelText(/September 6, 2026: 8 reviews/i)).toBeVisible();
});
