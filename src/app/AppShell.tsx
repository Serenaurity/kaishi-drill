import type { PropsWithChildren } from "react";
import { Link, NavLink } from "react-router-dom";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header>
        <Link className="brand" to="/">
          Kaishi Drill
        </Link>
        <nav aria-label="Primary">
          <NavLink to="/study">Vocabulary</NavLink>
          <NavLink to="/kana">Kana Trainer</NavLink>
          <NavLink to="/import">Import</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
