import { describe, expect, it } from "vitest";

import type { PersistedWorkspaceDockedPane } from "./uiStateStore";
import {
  MIN_WORKSPACE_PANE_WIDTH,
  mergeVisibleWorkspacePaneUpdates,
  reorderWorkspacePanes,
  resizeAdjacentWorkspacePanes,
  workspacePaneWidth,
} from "./workspacePaneLayout";

const panes: PersistedWorkspaceDockedPane[] = [
  {
    paneId: "editor",
    type: "editor",
    title: "Editor",
    environmentId: "env-1",
    cwd: "/repo",
    order: 0,
    size: 1,
    metadata: {},
  },
  {
    paneId: "ai",
    type: "ai",
    title: "AI",
    environmentId: "env-1",
    cwd: "/repo",
    order: 1,
    size: 1,
    metadata: { threadId: "thread-1" },
  },
  {
    paneId: "terminal",
    type: "terminal",
    title: "Terminal",
    environmentId: "env-1",
    cwd: "/repo",
    order: 2,
    size: 1,
    metadata: { threadId: "thread-1" },
  },
];

describe("workspace pane layout", () => {
  it("reorders panes and normalizes persisted order values", () => {
    const reordered = reorderWorkspacePanes(panes, "terminal", "editor");

    expect(reordered.map((pane) => pane.paneId)).toEqual(["terminal", "editor", "ai"]);
    expect(reordered.map((pane) => pane.order)).toEqual([0, 1, 2]);
  });

  it("resizes adjacent panes while preserving their combined width", () => {
    const hostWidth = 1_200;
    const initialWidth =
      workspacePaneWidth(panes[0]!, hostWidth) + workspacePaneWidth(panes[1]!, hostWidth);
    const resized = resizeAdjacentWorkspacePanes(panes, "editor", 120, hostWidth);
    const resizedWidth =
      workspacePaneWidth(resized[0]!, hostWidth) + workspacePaneWidth(resized[1]!, hostWidth);

    expect(workspacePaneWidth(resized[0]!, hostWidth)).toBeCloseTo(
      workspacePaneWidth(panes[0]!, hostWidth) + 120,
    );
    expect(resizedWidth).toBeCloseTo(initialWidth);
  });

  it("prevents adjacent panes from collapsing below the minimum width", () => {
    const hostWidth = 1_200;
    const resized = resizeAdjacentWorkspacePanes(panes, "editor", 10_000, hostWidth);

    expect(workspacePaneWidth(resized[1]!, hostWidth)).toBe(MIN_WORKSPACE_PANE_WIDTH);
  });

  it("keeps hidden panes while applying visible pane reorder and size updates", () => {
    const visiblePanes = reorderWorkspacePanes([panes[0]!, panes[1]!], "ai", "editor").map((pane) =>
      pane.paneId === "ai" ? Object.assign({}, pane, { size: 1.5 }) : pane,
    );
    const merged = mergeVisibleWorkspacePaneUpdates(panes, visiblePanes);

    expect(merged.map((pane) => pane.paneId)).toEqual(["ai", "editor", "terminal"]);
    expect(merged[0]?.size).toBe(1.5);
    expect(merged[2]).toMatchObject({ paneId: "terminal", order: 2 });
  });
});
