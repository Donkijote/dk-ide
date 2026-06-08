import { describe, expect, it } from "vitest";

import { resolveNewTerminalPaneActionLabel } from "./TerminalPaneHeader";

describe("resolveNewTerminalPaneActionLabel", () => {
  it("distinguishes pane creation from terminal splitting", () => {
    expect(resolveNewTerminalPaneActionLabel()).toBe("New Terminal Pane");
    expect(resolveNewTerminalPaneActionLabel("Ctrl+Shift+`")).toBe(
      "New Terminal Pane (Ctrl+Shift+`)",
    );
  });
});
