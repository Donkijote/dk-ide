import { describe, expect, it } from "vitest";

import type { PersistedWorkspaceDockedPane } from "./uiStateStore";
import {
  cycleWorkspacePaneWidthPreset,
  MIN_WORKSPACE_PANE_HEIGHT,
  MIN_WORKSPACE_TERMINAL_ROW_HEIGHT,
  WORKSPACE_PANE_GAP,
  mergeVisibleWorkspacePaneUpdates,
  moveWorkspacePaneByKeyboard,
  normalizeWorkspacePaneLayout,
  placeWorkspacePane,
  pushWorkspacePaneCollisions,
  reorderWorkspacePanes,
  resizeWorkspacePaneHeight,
  resizeWorkspacePaneWidth,
  setWorkspacePaneHeightPreset,
  setWorkspacePaneWidthPreset,
  workspacePaneColumns,
  workspacePaneDefaultWidth,
  workspacePaneHeightPreset,
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

  it("stacks vertical drops inside the target column", () => {
    const placed = placeWorkspacePane(panes, "terminal", "editor", "below");
    const rects = workspacePaneRects(placed, 1_280);
    const editor = rects.find((rect) => rect.pane.paneId === "editor")!;
    const terminal = rects.find((rect) => rect.pane.paneId === "terminal")!;

    expect(placed.map((pane) => pane.paneId)).toEqual(["editor", "terminal", "ai"]);
    expect(placed.find((pane) => pane.paneId === "editor")).toMatchObject({
      stackId: "stack:editor",
      stackOrder: 0,
      heightPreset: "half",
    });
    expect(placed.find((pane) => pane.paneId === "terminal")).toMatchObject({
      stackId: "stack:editor",
      stackOrder: 1,
      heightPreset: "half",
    });
    expect(terminal.x).toBeCloseTo(editor.x);
    expect(terminal.y).toBeGreaterThan(editor.y);
  });

  it("moves a stacked pane out into a neighboring column on horizontal drop", () => {
    const stacked = placeWorkspacePane(panes, "terminal", "editor", "below");
    const movedOut = placeWorkspacePane(stacked, "terminal", "editor", "after");
    const rects = workspacePaneRects(movedOut, 1_280);
    const editor = rects.find((rect) => rect.pane.paneId === "editor")!;
    const terminal = rects.find((rect) => rect.pane.paneId === "terminal")!;

    expect(movedOut.find((pane) => pane.paneId === "terminal")?.stackId).toBeUndefined();
    expect(movedOut.find((pane) => pane.paneId === "editor")?.stackId).toBeUndefined();
    expect(terminal.x).toBeCloseTo(editor.x + editor.width + WORKSPACE_PANE_GAP);
    expect(terminal.y).toBe(0);
  });

  it("moves panes horizontally by keyboard while preserving pane metadata", () => {
    const moved = moveWorkspacePaneByKeyboard(panes, "terminal", "left");

    expect(moved.map((pane) => pane.paneId)).toEqual(["editor", "terminal", "ai"]);
    expect(moved.find((pane) => pane.paneId === "terminal")?.metadata).toEqual({
      threadId: "thread-1",
    });
  });

  it("moves a stacked pane out into a neighboring column by keyboard", () => {
    const stacked = placeWorkspacePane(panes, "terminal", "editor", "below");
    const movedOut = moveWorkspacePaneByKeyboard(stacked, "terminal", "right");

    expect(movedOut.map((pane) => pane.paneId)).toEqual(["editor", "terminal", "ai"]);
    expect(movedOut.find((pane) => pane.paneId === "terminal")?.stackId).toBeUndefined();
    expect(movedOut.find((pane) => pane.paneId === "editor")?.stackId).toBeUndefined();
  });

  it("moves panes vertically within a stack by keyboard", () => {
    const stacked = placeWorkspacePane(panes, "terminal", "editor", "below");
    const movedUp = moveWorkspacePaneByKeyboard(stacked, "terminal", "up");

    expect(workspacePaneColumns(movedUp)[0]?.panes.map((pane) => pane.paneId)).toEqual([
      "terminal",
      "editor",
    ]);
    expect(movedUp.find((pane) => pane.paneId === "terminal")).toMatchObject({
      stackId: "stack:editor",
      stackOrder: 0,
      heightPreset: "half",
    });
  });

  it("stacks the active pane above or below a neighboring column by keyboard", () => {
    const stackedAbove = moveWorkspacePaneByKeyboard(panes, "editor", "stack-above");
    const stackedBelow = moveWorkspacePaneByKeyboard(panes, "editor", "stack-below");

    expect(workspacePaneColumns(stackedAbove)[0]?.panes.map((pane) => pane.paneId)).toEqual([
      "editor",
      "ai",
    ]);
    expect(workspacePaneColumns(stackedBelow)[0]?.panes.map((pane) => pane.paneId)).toEqual([
      "ai",
      "editor",
    ]);
  });

  it("keeps keyboard stacking unchanged when the target stack is full", () => {
    const fourthPane: PersistedWorkspaceDockedPane = {
      ...panes[0]!,
      paneId: "ai:second",
      type: "ai",
      title: "Second AI",
      order: 3,
      metadata: { threadId: "thread-2" },
    };
    const twoStack = placeWorkspacePane(panes, "terminal", "editor", "below");
    const threeStack = placeWorkspacePane([...twoStack, fourthPane], "ai", "terminal", "below");
    const unchanged = moveWorkspacePaneByKeyboard(threeStack, "ai:second", "stack-below");

    expect(unchanged).toEqual(threeStack);
  });

  it("caps stacked columns at three panes and falls back to neighboring insertion", () => {
    const fourthPane: PersistedWorkspaceDockedPane = {
      ...panes[0]!,
      paneId: "ai:second",
      type: "ai",
      title: "Second AI",
      order: 3,
      metadata: { threadId: "thread-2" },
    };
    const twoStack = placeWorkspacePane(panes, "terminal", "editor", "below");
    const threeStack = placeWorkspacePane([...twoStack, fourthPane], "ai", "terminal", "below");
    const capped = placeWorkspacePane(threeStack, "ai:second", "terminal", "below");

    expect(
      workspacePaneColumns(threeStack).find((column) => column.panes.length === 3),
    ).toBeTruthy();
    expect(capped.find((pane) => pane.paneId === "ai:second")?.stackId).toBeUndefined();
  });

  it("supports two-pane stack height presets", () => {
    const stacked = placeWorkspacePane(panes, "terminal", "editor", "below");
    const dominantTop = setWorkspacePaneHeightPreset(stacked, "editor", "top-heavy");
    const rects = workspacePaneRects(dominantTop, 1_280);
    const editor = rects.find((rect) => rect.pane.paneId === "editor")!;
    const terminal = rects.find((rect) => rect.pane.paneId === "terminal")!;

    expect(workspacePaneHeightPreset([dominantTop[0]!, dominantTop[1]!])).toBe("top-heavy");
    expect(editor.height).toBeGreaterThan(terminal.height);
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

  it("maps width presets to fractions of the available pane strip width", () => {
    const hostWidth = 1_280;

    expect(workspacePaneDefaultWidth({ ...panes[0]!, widthPreset: "narrow" }, hostWidth)).toBe(320);
    expect(workspacePaneDefaultWidth({ ...panes[0]!, widthPreset: "medium" }, hostWidth)).toBe(640);
    expect(workspacePaneDefaultWidth({ ...panes[0]!, widthPreset: "large" }, hostWidth)).toBe(960);
    expect(workspacePaneDefaultWidth({ ...panes[0]!, widthPreset: "wide" }, hostWidth)).toBe(1_280);
    expect(workspacePaneWidth(panes[0]!, hostWidth)).toBe(960);
    expect(workspacePaneWidth(panes[2]!, hostWidth)).toBe(640);
  });

  it("recomputes preset widths from the current host width", () => {
    const largePane = { ...panes[0]!, widthPreset: "large" as const };
    const widePane = { ...panes[0]!, widthPreset: "wide" as const };

    expect(workspacePaneWidth(largePane, 960)).toBe(720);
    expect(workspacePaneWidth(largePane, 1_600)).toBe(1_200);
    expect(workspacePaneWidth(widePane, 1_600)).toBe(1_600);
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
    expect(workspacePaneWidthPresetForWidth(panes[1]!, 360, 1_280)).toBe("narrow");
    expect(workspacePaneWidthPresetForWidth(panes[1]!, 600, 1_280)).toBe("medium");
    expect(workspacePaneWidthPresetForWidth(panes[1]!, 920, 1_280)).toBe("large");
    expect(workspacePaneWidthPresetForWidth(panes[1]!, 1_180, 1_280)).toBe("wide");
  });

  it("cycles width presets without changing sibling pane widths", () => {
    const resized = panes.map((pane) => (pane.paneId === "ai" ? { ...pane, width: 1_100 } : pane));
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
