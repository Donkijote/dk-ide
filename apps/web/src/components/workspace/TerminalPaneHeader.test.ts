import { describe, expect, it } from "vitest";

import {
  resolveNewTerminalPaneActionLabel,
  resolveTerminalPanePathLabel,
} from "./TerminalPaneHeader";

describe("resolveNewTerminalPaneActionLabel", () => {
  it("distinguishes pane creation from terminal splitting", () => {
    expect(resolveNewTerminalPaneActionLabel()).toBe("New Terminal Pane");
    expect(resolveNewTerminalPaneActionLabel("Ctrl+Shift+`")).toBe(
      "New Terminal Pane (Ctrl+Shift+`)",
    );
  });
});

describe("resolveTerminalPanePathLabel", () => {
  it("shows the final two path segments", () => {
    expect(resolveTerminalPanePathLabel("/Users/manuel/dk-ide/apps/server")).toBe("apps/server");
    expect(resolveTerminalPanePathLabel("C:\\repos\\dk-ide\\apps\\web\\")).toBe("apps/web");
  });

  it("keeps shorter paths readable", () => {
    expect(resolveTerminalPanePathLabel("/server")).toBe("server");
    expect(resolveTerminalPanePathLabel("/")).toBe("/");
  });
});
