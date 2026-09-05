import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ProgressChoice } from "./ProgressChoice";

it("disables Continue and explains how to export scheduling information", () => {
  render(<ProgressChoice deckId="deck" schedulingAvailable={false} />);

  expect(screen.getByRole("button", { name: /continue from anki/i })).toBeDisabled();
  expect(screen.getByText(/export the deck from anki with scheduling information/i)).toBeVisible();
});

it("initializes the selected mode explicitly", async () => {
  const user = userEvent.setup();
  const initialize = vi.fn().mockResolvedValue({
    skillCardsCreated: 2,
    seededSchedules: 0,
    importedReviews: 0,
    warnings: [],
  });
  render(
    <ProgressChoice deckId="deck" schedulingAvailable initialize={initialize} />,
  );

  await user.click(screen.getByRole("button", { name: /start fresh/i }));
  expect(initialize).toHaveBeenCalledWith(expect.objectContaining({
    deckId: "deck",
    mode: "fresh",
  }));
  expect(await screen.findByText(/study setup complete/i)).toBeVisible();
});
