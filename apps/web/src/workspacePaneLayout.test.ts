import { describe, expect, it } from "vitest";

import type { PersistedWorkspaceDockedPane } from "./uiStateStore";
import {
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
  workspacePaneDefaultWidth,
  workspacePaneHeight,
  workspacePaneRects,
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
    const rects = workspacePaneRects(placed, 1_280);
    const terminal = rects.find((rect) => rect.pane.paneId === "terminal")!;
    const stackedTerminal = rects.find((rect) => rect.pane.paneId === "terminal:2")!;

    expect(placed.map((pane) => pane.paneId)).toEqual(["editor", "ai", "terminal", "terminal:2"]);
    expect(stackedTerminal.x).toBe(terminal.x);
    expect(stackedTerminal.y).toBeGreaterThan(terminal.y + terminal.height);
  });

  it("places a horizontal drop directly beside the target", () => {
    const terminal2: PersistedWorkspaceDockedPane = {
      ...panes[2]!,
      paneId: "terminal:2",
      title: "Terminal 2",
      order: 3,
    };
    const placed = placeWorkspacePane([...panes, terminal2], "terminal:2", "terminal", "after");
    const rects = workspacePaneRects(placed, 1_280);
    const terminal = rects.find((rect) => rect.pane.paneId === "terminal")!;
    const besideTerminal = rects.find((rect) => rect.pane.paneId === "terminal:2")!;

    expect(besideTerminal.x).toBeGreaterThan(terminal.x + terminal.width);
    expect(besideTerminal.y).toBe(terminal.y);
  });

  it("places a terminal beside the AI pane without replacing it", () => {
    const placed = placeWorkspacePane(panes, "terminal", "ai", "after");
    const rects = workspacePaneRects(placed, 1_280);
    const ai = rects.find((rect) => rect.pane.paneId === "ai")!;
    const terminal = rects.find((rect) => rect.pane.paneId === "terminal")!;

    expect(terminal.x).toBeGreaterThan(ai.x + ai.width);
    expect(terminal.y).toBe(ai.y);
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
    const rects = workspacePaneRects(stacked, 1_280);
    const ai = rects.find((rect) => rect.pane.paneId === "ai")!;
    const terminal = rects.find((rect) => rect.pane.paneId === "terminal")!;
    const stackedTerminal = rects.find((rect) => rect.pane.paneId === "terminal:2")!;

    expect(terminal.x).toBeGreaterThan(ai.x + ai.width);
    expect(stackedTerminal.x).toBe(terminal.x);
    expect(stackedTerminal.y).toBeGreaterThan(terminal.y + terminal.height);
  });

  it("stacks a terminal below the editor pane", () => {
    const placed = placeWorkspacePane(panes, "terminal", "editor", "below");
    const rects = workspacePaneRects(placed, 1_280);
    const editor = rects.find((rect) => rect.pane.paneId === "editor")!;
    const ai = rects.find((rect) => rect.pane.paneId === "ai")!;
    const terminal = rects.find((rect) => rect.pane.paneId === "terminal")!;

    expect(terminal.x).toBe(editor.x);
    expect(terminal.y).toBeGreaterThan(editor.y + editor.height);
    expect(ai.y).toBe(editor.y);
  });

  it("swaps panes when dropped over each other", () => {
    const initialRects = workspacePaneRects(panes, 1_280);
    const initialEditor = initialRects.find((rect) => rect.pane.paneId === "editor")!;
    const initialAi = initialRects.find((rect) => rect.pane.paneId === "ai")!;
    const placed = placeWorkspacePane(panes, "ai", "editor", "swap");
    const rects = workspacePaneRects(placed, 1_280);
    const editor = rects.find((rect) => rect.pane.paneId === "editor")!;
    const ai = rects.find((rect) => rect.pane.paneId === "ai")!;

    expect({ x: ai.x, y: ai.y }).toEqual({ x: initialEditor.x, y: initialEditor.y });
    expect(editor.x).toBe(Math.round(initialAi.x));
    expect(editor.y).toBe(initialAi.y);
  });

  it("supports a two-pane top row and an independent three-terminal bottom row", () => {
    const terminal2: PersistedWorkspaceDockedPane = {
      ...panes[2]!,
      paneId: "terminal:2",
      title: "Terminal 2",
      order: 3,
    };
    const terminal3: PersistedWorkspaceDockedPane = {
      ...panes[2]!,
      paneId: "terminal:3",
      title: "Terminal 3",
      order: 4,
    };

    const belowEditor = placeWorkspacePane(
      [...panes, terminal2, terminal3],
      "terminal",
      "editor",
      "below",
    );
    const secondInBottomRow = placeWorkspacePane(belowEditor, "terminal:2", "terminal", "after");
    const thirdInBottomRow = placeWorkspacePane(
      secondInBottomRow,
      "terminal:3",
      "terminal:2",
      "after",
    );
    const rects = workspacePaneRects(thirdInBottomRow, 1_280);
    const editor = rects.find((rect) => rect.pane.paneId === "editor")!;
    const ai = rects.find((rect) => rect.pane.paneId === "ai")!;
    const terminals = ["terminal", "terminal:2", "terminal:3"].map(
      (paneId) => rects.find((rect) => rect.pane.paneId === paneId)!,
    );

    expect(ai.y).toBe(editor.y);
    expect(terminals.map((terminal) => terminal.y)).toEqual([
      terminals[0]!.y,
      terminals[0]!.y,
      terminals[0]!.y,
    ]);
    expect(terminals[0]!.y).toBeGreaterThan(editor.y + editor.height);
    expect(terminals[1]!.x).toBeGreaterThan(terminals[0]!.x + terminals[0]!.width);
    expect(terminals[2]!.x).toBeGreaterThan(terminals[1]!.x + terminals[1]!.width);
  });

  it("pushes a colliding pane when a pane grows", () => {
    const hostWidth = 1_200;
    const besideAi = placeWorkspacePane(panes, "terminal", "ai", "after", hostWidth);
    const beforeRects = workspacePaneRects(besideAi, hostWidth);
    const terminalBefore = beforeRects.find((rect) => rect.pane.paneId === "terminal")!;
    const aiBefore = beforeRects.find((rect) => rect.pane.paneId === "ai")!;
    const resized = resizeWorkspacePaneWidth(besideAi, "ai", aiBefore.width + 120, hostWidth);
    const pushed = pushWorkspacePaneCollisions(
      resized,
      "ai",
      "horizontal",
      hostWidth,
      MIN_WORKSPACE_PANE_HEIGHT,
      320,
    );
    const afterRects = workspacePaneRects(pushed, hostWidth);
    const aiAfter = afterRects.find((rect) => rect.pane.paneId === "ai")!;
    const terminalAfter = afterRects.find((rect) => rect.pane.paneId === "terminal")!;

    expect(aiAfter.width).toBeCloseTo(aiBefore.width + 120);
    expect(terminalAfter.x).toBeGreaterThan(terminalBefore.x);
    expect(terminalAfter.y).toBe(terminalBefore.y);
  });

  it("pushes multiple colliding panes into a non-overlapping chain", () => {
    const hostWidth = 1_200;
    const terminal2: PersistedWorkspaceDockedPane = {
      ...panes[2]!,
      paneId: "terminal:2",
      title: "Terminal 2",
      order: 3,
      dockX: 1_224,
      dockY: 0,
    };
    const positionedPanes = [
      { ...panes[0]!, dockX: 0, dockY: 0 },
      { ...panes[1]!, dockX: 2_000, dockY: 0 },
      { ...panes[2]!, dockX: 684, dockY: 0 },
      terminal2,
    ];
    const resized = resizeWorkspacePaneWidth(positionedPanes, "editor", 1_400, hostWidth);
    const pushed = pushWorkspacePaneCollisions(
      resized,
      "editor",
      "horizontal",
      hostWidth,
      MIN_WORKSPACE_PANE_HEIGHT,
      320,
    );
    const rects = workspacePaneRects(pushed, hostWidth);
    const firstTerminal = rects.find((rect) => rect.pane.paneId === "terminal")!;
    const secondTerminal = rects.find((rect) => rect.pane.paneId === "terminal:2")!;

    expect(secondTerminal.x).toBeGreaterThan(firstTerminal.x + firstTerminal.width);
  });

  it("rebases persisted pane coordinates to remove empty leading workspace space", () => {
    const positionedPanes = panes.map((pane, index) => ({
      ...pane,
      dockX: 480 + index * 700,
      dockY: 60,
    }));

    const normalized = normalizeWorkspacePaneLayout(positionedPanes, 1_280);
    const rects = workspacePaneRects(normalized, 1_280);

    expect(Math.min(...rects.map((rect) => rect.x))).toBe(0);
    expect(Math.min(...rects.map((rect) => rect.y))).toBe(0);
  });

  it("repairs overlapping persisted panes without changing their row direction", () => {
    const positionedPanes = [
      { ...panes[0]!, dockX: 420, dockY: 40 },
      { ...panes[1]!, dockX: 900, dockY: 40 },
      { ...panes[2]!, dockX: 420, dockY: 600 },
    ];

    const normalized = normalizeWorkspacePaneLayout(positionedPanes, 1_600);
    const rects = workspacePaneRects(normalized, 1_600);
    const editor = rects.find((rect) => rect.pane.paneId === "editor")!;
    const ai = rects.find((rect) => rect.pane.paneId === "ai")!;
    const terminal = rects.find((rect) => rect.pane.paneId === "terminal")!;

    expect(editor.x).toBe(0);
    expect(editor.y).toBe(0);
    expect(ai.x).toBeGreaterThanOrEqual(editor.x + editor.width + WORKSPACE_PANE_GAP);
    expect(terminal.y).toBeGreaterThanOrEqual(editor.y + editor.height + WORKSPACE_PANE_GAP);
  });

  it("repairs a stale gap between the default editor and AI panes", () => {
    const hostWidth = 1_600;
    const editorWidth = workspacePaneWidth(panes[0]!, hostWidth);
    const positionedPanes = [
      { ...panes[0]!, dockX: 0, dockY: 0 },
      {
        ...panes[1]!,
        dockX: Math.round(editorWidth + 120),
        dockY: 0,
      },
      { ...panes[2]!, dockX: 0, dockY: MIN_WORKSPACE_PANE_HEIGHT + WORKSPACE_PANE_GAP },
    ];

    const normalized = normalizeWorkspacePaneLayout(positionedPanes, hostWidth);
    const rects = workspacePaneRects(normalized, hostWidth);
    const editor = rects.find((rect) => rect.pane.paneId === "editor")!;
    const ai = rects.find((rect) => rect.pane.paneId === "ai")!;

    expect(ai.x).toBeCloseTo(editor.x + editor.width + WORKSPACE_PANE_GAP, 0);
  });

  it("preserves a pane intentionally placed between the editor and AI panes", () => {
    const hostWidth = 1_600;
    const editorWidth = workspacePaneWidth(panes[0]!, hostWidth);
    const terminalWidth = workspacePaneWidth(panes[2]!, hostWidth);
    const positionedPanes = [
      { ...panes[0]!, dockX: 0, dockY: 0 },
      {
        ...panes[2]!,
        dockX: Math.round(editorWidth + WORKSPACE_PANE_GAP),
        dockY: 0,
      },
      {
        ...panes[1]!,
        dockX: Math.round(editorWidth + terminalWidth + WORKSPACE_PANE_GAP * 2),
        dockY: 0,
      },
    ];

    const normalized = normalizeWorkspacePaneLayout(positionedPanes, hostWidth);
    const rects = workspacePaneRects(normalized, hostWidth);
    const terminal = rects.find((rect) => rect.pane.paneId === "terminal")!;
    const ai = rects.find((rect) => rect.pane.paneId === "ai")!;

    expect(ai.x).toBeGreaterThanOrEqual(terminal.x + terminal.width + WORKSPACE_PANE_GAP);
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

  it("uses the terminal default height as the terminal resize minimum", () => {
    const undersized = resizeWorkspacePaneHeight(
      panes,
      "terminal",
      100,
      MIN_WORKSPACE_TERMINAL_ROW_HEIGHT,
    );

    expect(workspacePaneHeight(undersized[2]!, MIN_WORKSPACE_TERMINAL_ROW_HEIGHT)).toBe(
      MIN_WORKSPACE_TERMINAL_ROW_HEIGHT,
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
