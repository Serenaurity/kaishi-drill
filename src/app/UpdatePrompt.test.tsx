import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { setReviewInteractionActive } from "./review-activity";
import { UpdatePrompt } from "./UpdatePrompt";

const sw = vi.hoisted(() => ({
  setNeedRefresh: vi.fn(),
  setOfflineReady: vi.fn(),
  updateServiceWorker: vi.fn(),
}));

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [true, sw.setNeedRefresh],
    offlineReady: [false, sw.setOfflineReady],
    updateServiceWorker: sw.updateServiceWorker,
  }),
}));

afterEach(() => {
  cleanup();
  setReviewInteractionActive(false);
  vi.clearAllMocks();
});

it("defers an available update until the active answer is idle", () => {
  render(<UpdatePrompt />);
  expect(screen.getByText("Update available")).toBeVisible();

  act(() => setReviewInteractionActive(true));
  expect(screen.queryByText("Update available")).not.toBeInTheDocument();

  act(() => setReviewInteractionActive(false));
  expect(screen.getByText("Update available")).toBeVisible();
});
