import { describe, expect, it } from "vitest";

import type { PersistedWorkspaceDockedPane } from "./uiStateStore";
import {
  cycleWorkspacePaneWidthPreset,
  MIN_WORKSPACE_PANE_HEIGHT,
  MIN_WORKSPACE_TERMINAL_ROW_HEIGHT,
  WORKSPACE_PANE_GAP,
  mergeVisibleWorkspacePaneUpdates,
  normalizeWorkspacePaneLayout,
  placeWorkspacePane,
  pushWorkspacePaneCollisions,
  reorderWorkspacePanes,
  resizeWorkspacePaneHeight,
  resizeWorkspacePaneWidth,
  setWorkspacePaneWidthPreset,
  workspacePaneDefaultWidth,
  workspacePaneHeight,
  workspacePaneRects,
  workspacePaneWidth,
  workspacePaneWidthPresetForWidth,
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
    widthPreset: "large",
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
    widthPreset: "large",
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
    widthPreset: "medium",
    metadata: { threadId: "thread-1" },
  },
];

describe("workspace pane layout", () => {
  it("reorders panes and normalizes persisted order values", () => {
    const reordered = reorderWorkspacePanes(panes, "terminal", "editor");

    expect(reordered.map((pane) => pane.paneId)).toEqual(["terminal", "editor", "ai"]);
    expect(reordered.map((pane) => pane.order)).toEqual([0, 1, 2]);
  });

  it("lays out every top-level pane in one horizontal strip", () => {
    const rects = workspacePaneRects(panes, 1_280);
    const editor = rects.find((rect) => rect.pane.paneId === "editor")!;
    const ai = rects.find((rect) => rect.pane.paneId === "ai")!;
    const terminal = rects.find((rect) => rect.pane.paneId === "terminal")!;

    expect(rects.map((rect) => rect.y)).toEqual([0, 0, 0]);
    expect(ai.x).toBeCloseTo(editor.x + editor.width + WORKSPACE_PANE_GAP);
    expect(terminal.x).toBeCloseTo(ai.x + ai.width + WORKSPACE_PANE_GAP);
    expect(terminal.height).toBe(MIN_WORKSPACE_PANE_HEIGHT);
  });

  it("treats vertical drops as strip insertion instead of rows", () => {
    const placed = placeWorkspacePane(panes, "terminal", "editor", "below");
    const rects = workspacePaneRects(placed, 1_280);
    const editor = rects.find((rect) => rect.pane.paneId === "editor")!;
    const terminal = rects.find((rect) => rect.pane.paneId === "terminal")!;

    expect(placed.map((pane) => pane.paneId)).toEqual(["editor", "terminal", "ai"]);
    expect(terminal.x).toBeCloseTo(editor.x + editor.width + WORKSPACE_PANE_GAP);
    expect(terminal.y).toBe(0);
  });

  it("places a horizontal drop directly beside the target", () => {
    const placed = placeWorkspacePane(panes, "terminal", "ai", "after");

    expect(placed.map((pane) => pane.paneId)).toEqual(["editor", "ai", "terminal"]);
    expect(placed.map((pane) => pane.order)).toEqual([0, 1, 2]);
  });

  it("swaps panes when dropped over each other", () => {
    const placed = placeWorkspacePane(panes, "ai", "editor", "swap");

    expect(placed.map((pane) => pane.paneId)).toEqual(["ai", "editor", "terminal"]);
    expect(placed.map((pane) => pane.order)).toEqual([0, 1, 2]);
  });

  it("normalizes stale dock coordinates into ordered strip coordinates", () => {
    const positionedPanes = [
      { ...panes[0]!, dockX: 420, dockY: 40 },
      { ...panes[1]!, dockX: 900, dockY: 40 },
      { ...panes[2]!, dockX: 420, dockY: 600 },
    ];

    const normalized = normalizeWorkspacePaneLayout(positionedPanes, 1_600);
    const rects = workspacePaneRects(normalized, 1_600);

    expect(normalized.map((pane) => pane.dockY)).toEqual([0, 0, 0]);
    expect(normalized.map((pane) => pane.dockColumn)).toEqual([0, 1, 2]);
    expect(rects.map((rect) => rect.y)).toEqual([0, 0, 0]);
    expect(rects[1]!.x).toBeCloseTo(rects[0]!.x + rects[0]!.width + WORKSPACE_PANE_GAP);
  });

  it("uses role-based widths for default panes", () => {
    const hostWidth = 1_280;

    expect(workspacePaneWidth(panes[0]!, hostWidth)).toBe(
      workspacePaneDefaultWidth(panes[0]!, hostWidth),
    );
    expect(workspacePaneWidth(panes[1]!, hostWidth)).toBe(
      workspacePaneDefaultWidth(panes[1]!, hostWidth),
    );
    expect(workspacePaneWidth(panes[2]!, hostWidth)).toBe(
      workspacePaneDefaultWidth(panes[2]!, hostWidth),
    );
    expect(workspacePaneWidth(panes[2]!, hostWidth)).toBeLessThan(
      workspacePaneWidth(panes[0]!, hostWidth),
    );
  });

  it("snaps pointer resize widths to presets while preserving strip order", () => {
    const resized = resizeWorkspacePaneWidth(panes, "ai", 1_800, 1_280);
    const rects = workspacePaneRects(resized, 1_280);
    const ai = rects.find((rect) => rect.pane.paneId === "ai")!;
    const terminal = rects.find((rect) => rect.pane.paneId === "terminal")!;

    expect(resized.find((pane) => pane.paneId === "ai")).toMatchObject({
      widthPreset: "wide",
      size: 1,
    });
    expect(resized.find((pane) => pane.paneId === "ai")?.width).toBeUndefined();
    expect(ai.width).toBe(workspacePaneDefaultWidth({ ...panes[1]!, widthPreset: "wide" }, 1_280));
    expect(terminal.x).toBeCloseTo(ai.x + ai.width + WORKSPACE_PANE_GAP);
  });

  it("resolves direct width requests to the nearest column preset", () => {
    expect(workspacePaneWidthPresetForWidth(panes[1]!, 320, 1_280)).toBe("narrow");
    expect(workspacePaneWidthPresetForWidth(panes[1]!, 520, 1_280)).toBe("medium");
    expect(workspacePaneWidthPresetForWidth(panes[1]!, 760, 1_280)).toBe("large");
    expect(workspacePaneWidthPresetForWidth(panes[1]!, 1_120, 1_280)).toBe("wide");
  });

  it("cycles width presets without changing sibling pane widths", () => {
    const resized = panes.map((pane) =>
      pane.paneId === "ai" ? { ...pane, width: 1_100 } : pane,
    );
    const cycled = cycleWorkspacePaneWidthPreset(resized, "ai", "next");
    const terminalBefore = workspacePaneWidth(resized[2]!, 1_280);
    const terminalAfter = workspacePaneWidth(cycled[2]!, 1_280);

    expect(cycled[1]).toMatchObject({
      paneId: "ai",
      widthPreset: "wide",
      size: 1,
    });
    expect(cycled[1]?.width).toBeUndefined();
    expect(terminalAfter).toBe(terminalBefore);
  });

  it("cycles width presets backward with wraparound", () => {
    const cycled = cycleWorkspacePaneWidthPreset(panes, "terminal", "previous");

    expect(cycled.find((pane) => pane.paneId === "terminal")?.widthPreset).toBe("narrow");
  });

  it("sets an explicit width preset and clears custom pane width", () => {
    const resized = resizeWorkspacePaneWidth(panes, "editor", 1_100, 1_280);
    const next = setWorkspacePaneWidthPreset(resized, "editor", "narrow");

    expect(next[0]).toMatchObject({
      paneId: "editor",
      widthPreset: "narrow",
      size: 1,
    });
    expect(next[0]?.width).toBeUndefined();
    expect(next[1]).toStrictEqual(resized[1]);
  });

  it("keeps collision repair as strip normalization for compatibility callers", () => {
    const resized = resizeWorkspacePaneWidth(panes, "editor", 1_100, 1_280);
    const normalized = pushWorkspacePaneCollisions(
      resized,
      "editor",
      "horizontal",
      1_280,
      MIN_WORKSPACE_PANE_HEIGHT,
      320,
    );

    expect(normalized.map((pane) => pane.order)).toEqual([0, 1, 2]);
    expect(normalized.map((pane) => pane.dockY)).toEqual([0, 0, 0]);
  });

  it("uses the default terminal row height as its minimum", () => {
    expect(workspaceTerminalRowHeight(120)).toBe(MIN_WORKSPACE_TERMINAL_ROW_HEIGHT);
    expect(workspaceTerminalRowHeight(360)).toBe(360);
  });

  it("keeps exported height helpers compatible for persisted state sanitization", () => {
    const resized = resizeWorkspacePaneHeight(panes, "ai", 900, MIN_WORKSPACE_PANE_HEIGHT);
    const undersized = resizeWorkspacePaneHeight(panes, "ai", 200, MIN_WORKSPACE_PANE_HEIGHT);

    expect(workspacePaneHeight(resized[1]!, MIN_WORKSPACE_PANE_HEIGHT)).toBe(900);
    expect(workspacePaneHeight(undersized[1]!, MIN_WORKSPACE_PANE_HEIGHT)).toBe(
      MIN_WORKSPACE_PANE_HEIGHT,
    );
  });

  it("keeps hidden panes while applying visible pane reorder and size updates", () => {
    const visiblePanes = reorderWorkspacePanes([panes[0]!, panes[1]!], "ai", "editor").map((pane) =>
      pane.paneId === "ai" ? Object.assign({}, pane, { width: 900 }) : pane,
    );
    const merged = mergeVisibleWorkspacePaneUpdates(panes, visiblePanes);

    expect(merged.map((pane) => pane.paneId)).toEqual(["ai", "editor", "terminal"]);
    expect(merged[0]?.width).toBe(900);
    expect(merged[2]).toMatchObject({ paneId: "terminal", order: 2 });
  });
});
