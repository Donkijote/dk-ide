import { describe, expect, it } from "vitest";

import type { PersistedWorkspaceDockedPane } from "./uiStateStore";
import {
  MIN_WORKSPACE_PANE_HEIGHT,
  MIN_WORKSPACE_TERMINAL_ROW_HEIGHT,
  mergeVisibleWorkspacePaneUpdates,
  placeWorkspacePane,
  reorderWorkspacePanes,
  resizeAdjacentWorkspacePanes,
  resizeWorkspacePaneHeight,
  workspacePaneDefaultWidth,
  workspacePaneHeight,
  workspacePanePlacements,
  workspacePaneWidth,
  workspaceTerminalRowHeight,
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

  it("stacks a terminal below another terminal", () => {
    const terminal2: PersistedWorkspaceDockedPane = {
      ...panes[2]!,
      paneId: "terminal:2",
      title: "Terminal 2",
      order: 3,
    };
    const placed = placeWorkspacePane([...panes, terminal2], "terminal:2", "terminal", "below");
    const placements = workspacePanePlacements(placed);

    expect(placed.map((pane) => pane.paneId)).toEqual(["editor", "ai", "terminal", "terminal:2"]);
    expect(placements.get("terminal")).toEqual({ slot: "grid", column: 0, row: 0 });
    expect(placements.get("terminal:2")).toEqual({ slot: "grid", column: 0, row: 1 });
  });

  it("keeps a horizontal drop in a separate terminal column", () => {
    const terminal2: PersistedWorkspaceDockedPane = {
      ...panes[2]!,
      paneId: "terminal:2",
      title: "Terminal 2",
      order: 3,
    };
    const placed = placeWorkspacePane([...panes, terminal2], "terminal:2", "terminal", "after");
    const placements = workspacePanePlacements(placed);

    expect(placements.get("terminal")).toEqual({ slot: "grid", column: 0, row: 0 });
    expect(placements.get("terminal:2")).toEqual({ slot: "grid", column: 1, row: 0 });
  });

  it("places a terminal beside the AI pane without replacing it", () => {
    const placed = placeWorkspacePane(panes, "terminal", "ai", "after");
    const placements = workspacePanePlacements(placed);

    expect(placements.get("ai")).toEqual({ slot: "upper", column: 0, row: 0 });
    expect(placements.get("terminal")).toEqual({ slot: "upper", column: 1, row: 0 });
  });

  it("stacks a terminal below a terminal beside the AI pane", () => {
    const terminal2: PersistedWorkspaceDockedPane = {
      ...panes[2]!,
      paneId: "terminal:2",
      title: "Terminal 2",
      order: 3,
    };
    const besideAi = placeWorkspacePane([...panes, terminal2], "terminal", "ai", "after");
    const stacked = placeWorkspacePane(besideAi, "terminal:2", "terminal", "below");
    const placements = workspacePanePlacements(stacked);

    expect(placements.get("ai")).toEqual({ slot: "upper", column: 0, row: 0 });
    expect(placements.get("terminal")).toEqual({ slot: "upper", column: 1, row: 0 });
    expect(placements.get("terminal:2")).toEqual({ slot: "upper", column: 1, row: 1 });
  });

  it("swaps editor and AI layout slots", () => {
    const placed = placeWorkspacePane(panes, "ai", "editor", "before");
    const placements = workspacePanePlacements(placed);

    expect(placements.get("ai")?.slot).toBe("primary");
    expect(placements.get("editor")?.slot).toBe("upper");
  });

  it("transfers available width from the adjacent pane before expanding the workspace", () => {
    const hostWidth = 1_200;
    const expandedPanes = panes.map((pane) =>
      pane.paneId === "ai" ? Object.assign({}, pane, { size: 1.5 }) : pane,
    );
    const initialWidth =
      workspacePaneWidth(expandedPanes[0]!, hostWidth) +
      workspacePaneWidth(expandedPanes[1]!, hostWidth);
    const resized = resizeAdjacentWorkspacePanes(expandedPanes, "editor", 120, hostWidth);
    const resizedWidth =
      workspacePaneWidth(resized[0]!, hostWidth) + workspacePaneWidth(resized[1]!, hostWidth);

    expect(workspacePaneWidth(resized[0]!, hostWidth)).toBeCloseTo(
      workspacePaneWidth(expandedPanes[0]!, hostWidth) + 120,
    );
    expect(resizedWidth).toBeCloseTo(initialWidth);
  });

  it("uses each pane's default width as its minimum and expands the workspace after that", () => {
    const hostWidth = 1_200;
    const initialCombinedWidth =
      workspacePaneWidth(panes[0]!, hostWidth) + workspacePaneWidth(panes[1]!, hostWidth);
    const resized = resizeAdjacentWorkspacePanes(panes, "editor", 10_000, hostWidth);
    const resizedCombinedWidth =
      workspacePaneWidth(resized[0]!, hostWidth) + workspacePaneWidth(resized[1]!, hostWidth);

    expect(workspacePaneWidth(resized[1]!, hostWidth)).toBe(
      workspacePaneDefaultWidth(panes[1]!, hostWidth),
    );
    expect(resizedCombinedWidth).toBeGreaterThan(initialCombinedWidth);
  });

  it("clamps persisted pane sizes below one to the default footprint", () => {
    const hostWidth = 1_200;
    const undersizedPane = Object.assign({}, panes[1]!, { size: 0.25 });

    expect(workspacePaneWidth(undersizedPane, hostWidth)).toBe(
      workspacePaneDefaultWidth(undersizedPane, hostWidth),
    );
  });

  it("uses the terminal footprint for every added pane type", () => {
    const hostWidth = 1_200;
    const addedEditor = Object.assign({}, panes[0]!, {
      paneId: "editor:docs",
    });

    expect(workspacePaneWidth(addedEditor, hostWidth)).toBe(
      workspacePaneWidth(panes[2]!, hostWidth),
    );
    expect(workspacePaneWidth(addedEditor, hostWidth)).toBeLessThan(
      workspacePaneWidth(panes[0]!, hostWidth),
    );
  });

  it("uses the default terminal row height as its minimum", () => {
    expect(workspaceTerminalRowHeight(120)).toBe(MIN_WORKSPACE_TERMINAL_ROW_HEIGHT);
    expect(workspaceTerminalRowHeight(360)).toBe(360);
  });

  it("uses the full default pane height as the minimum when resizing downward", () => {
    const resized = resizeWorkspacePaneHeight(panes, "ai", 900, MIN_WORKSPACE_PANE_HEIGHT);
    const undersized = resizeWorkspacePaneHeight(panes, "ai", 200, MIN_WORKSPACE_PANE_HEIGHT);

    expect(workspacePaneHeight(resized[1]!, MIN_WORKSPACE_PANE_HEIGHT)).toBe(900);
    expect(workspacePaneHeight(undersized[1]!, MIN_WORKSPACE_PANE_HEIGHT)).toBe(
      MIN_WORKSPACE_PANE_HEIGHT,
    );
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
