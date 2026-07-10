import { describe, expect, it } from "vitest";

import type { PersistedWorkspaceDockedPane } from "~/uiStateStore";
import {
  workspacePaneDropDirection,
  workspacePaneHostLayoutSize,
  workspacePaneKeyboardFocusTarget,
  workspacePaneScrollTarget,
} from "./WorkspacePaneHost.logic";

const panes: PersistedWorkspaceDockedPane[] = [
  {
    paneId: "editor",
    type: "editor",
    title: "Editor",
    environmentId: "local",
    cwd: "/repo",
    order: 0,
    size: 1,
    widthPreset: "large",
    metadata: {},
  },
  {
    paneId: "ai",
    type: "ai",
    title: "AI",
    environmentId: "local",
    cwd: "/repo",
    order: 1,
    size: 1,
    widthPreset: "large",
    metadata: { threadId: "thread-1" },
  },
  {
    paneId: "terminal",
    type: "terminal",
    title: "Terminal",
    environmentId: "local",
    cwd: "/repo",
    order: 2,
    size: 1,
    widthPreset: "medium",
    metadata: { threadId: "thread-1" },
  },
];

describe("workspacePaneDropDirection", () => {
  it("uses the release pointer when moving an upper pane beside a lower pane", () => {
    expect(
      workspacePaneDropDirection({
        activeRect: {
          left: 880,
          top: 120,
          width: 560,
          height: 280,
        },
        overRect: {
          left: 16,
          top: 420,
          width: 840,
          height: 280,
        },
        pointer: {
          x: 820,
          y: 560,
        },
      }),
    ).toBe("after");
  });

  it("keeps center drops as swaps", () => {
    expect(
      workspacePaneDropDirection({
        activeRect: null,
        overRect: {
          left: 100,
          top: 200,
          width: 600,
          height: 300,
        },
        pointer: {
          x: 400,
          y: 350,
        },
      }),
    ).toBe("swap");
  });
});

describe("workspacePaneKeyboardFocusTarget", () => {
  it("moves to adjacent panes without wrapping", () => {
    expect(workspacePaneKeyboardFocusTarget(panes, "ai", "previous")).toBe("editor");
    expect(workspacePaneKeyboardFocusTarget(panes, "ai", "next")).toBe("terminal");
    expect(workspacePaneKeyboardFocusTarget(panes, "editor", "previous")).toBe("editor");
    expect(workspacePaneKeyboardFocusTarget(panes, "terminal", "next")).toBe("terminal");
  });

  it("supports first and last navigation from missing active state", () => {
    expect(workspacePaneKeyboardFocusTarget(panes, null, "first")).toBe("editor");
    expect(workspacePaneKeyboardFocusTarget(panes, "missing", "last")).toBe("terminal");
    expect(workspacePaneKeyboardFocusTarget([], "missing", "next")).toBeNull();
  });
});

describe("workspacePaneScrollTarget", () => {
  it("preserves scroll when the focused pane is already visible", () => {
    expect(
      workspacePaneScrollTarget({
        paneLeft: 240,
        paneWidth: 520,
        viewportLeft: 200,
        viewportWidth: 800,
      }),
    ).toBeNull();
  });

  it("centers a newly focused hidden pane when it fits inside the viewport", () => {
    expect(
      workspacePaneScrollTarget({
        paneLeft: 960,
        paneWidth: 520,
        viewportLeft: 0,
        viewportWidth: 800,
      }),
    ).toBe(820);
  });

  it("aligns the leading edge for panes wider than the viewport", () => {
    expect(
      workspacePaneScrollTarget({
        paneLeft: 480,
        paneWidth: 960,
        viewportLeft: 0,
        viewportWidth: 800,
      }),
    ).toBe(480);
  });
});

describe("workspacePaneHostLayoutSize", () => {
  it("uses the current host width minus strip inset so full-width panes can follow window resizes", () => {
    expect(workspacePaneHostLayoutSize({ clientWidth: 1_280, clientHeight: 768 })).toMatchObject({
      width: 1_280,
    });
    expect(
      workspacePaneHostLayoutSize({
        clientWidth: 1_920,
        clientHeight: 768,
        horizontalInset: 32,
      }),
    ).toMatchObject({
      width: 1_888,
    });
  });

  it("keeps pane height at the workspace minimum when the host is short", () => {
    expect(workspacePaneHostLayoutSize({ clientWidth: 0, clientHeight: 400 })).toEqual({
      width: 1,
      height: 736,
    });
  });
});
