import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { App } from "./App";

it("shows the two study modules", () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByRole("link", { name: /vocabulary/i })).toBeVisible();
  expect(screen.getByRole("link", { name: /kana trainer/i })).toBeVisible();
});
