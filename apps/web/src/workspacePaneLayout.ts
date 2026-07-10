import type {
  PersistedWorkspaceDockedPane,
  WorkspaceDockedPaneType,
  WorkspaceDockedPaneWidthPreset,
  WorkspaceDockedPaneSlot,
} from "./uiStateStore";

export const MIN_WORKSPACE_TERMINAL_ROW_HEIGHT = 280;
export const MIN_WORKSPACE_PANE_HEIGHT = 736;
export const WORKSPACE_PANE_GAP = 12;

const MAX_WORKSPACE_PANE_WIDTH = 1_400;
const MAX_WORKSPACE_PANE_HEIGHT = 4_000;
const MIN_CUSTOM_WORKSPACE_PANE_WIDTH = 280;
export const WORKSPACE_PANE_WIDTH_PRESETS = ["narrow", "medium", "large", "wide"] as const;

export type WorkspacePaneDropDirection = "above" | "below" | "before" | "after" | "swap";

export interface WorkspacePanePlacement {
  readonly slot: WorkspaceDockedPaneSlot;
  readonly column: number;
  readonly row: number;
}

export interface WorkspacePaneColumn {
  readonly column: number;
  readonly panes: readonly PersistedWorkspaceDockedPane[];
}

export interface WorkspacePaneRect {
  readonly pane: PersistedWorkspaceDockedPane;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function workspacePaneWidthPreset(
  pane: Pick<PersistedWorkspaceDockedPane, "paneId"> & {
    readonly type?: WorkspaceDockedPaneType;
    readonly widthPreset?: WorkspaceDockedPaneWidthPreset;
  },
): WorkspaceDockedPaneWidthPreset {
  if (pane.widthPreset) {
    return pane.widthPreset;
  }
  if (pane.type === "terminal" || pane.paneId.startsWith("terminal")) {
    return "medium";
  }
  return "large";
}

export function workspacePaneDefaultWidth(
  pane: Pick<PersistedWorkspaceDockedPane, "paneId"> & {
    readonly type?: WorkspaceDockedPaneType;
    readonly widthPreset?: WorkspaceDockedPaneWidthPreset;
  },
  hostWidth: number,
): number {
  const safeHostWidth = Number.isFinite(hostWidth) && hostWidth > 0 ? hostWidth : 1_280;
  switch (workspacePaneWidthPreset(pane)) {
    case "narrow":
      return clamp(safeHostWidth * 0.24, 280, 420);
    case "medium":
      return clamp(safeHostWidth * 0.38, 384, 680);
    case "wide":
      return clamp(safeHostWidth * 0.82, 760, MAX_WORKSPACE_PANE_WIDTH);
    case "large":
    default:
      return clamp(safeHostWidth * 0.56, 560, 960);
  }
}

export function workspacePaneWidthPresetForWidth(
  pane: Pick<PersistedWorkspaceDockedPane, "paneId"> & {
    readonly type?: WorkspaceDockedPaneType;
  },
  width: number,
  hostWidth: number,
): WorkspaceDockedPaneWidthPreset {
  if (!Number.isFinite(width)) {
    return workspacePaneWidthPreset(pane);
  }

  const targetWidth = clamp(width, MIN_CUSTOM_WORKSPACE_PANE_WIDTH, MAX_WORKSPACE_PANE_WIDTH);
  return WORKSPACE_PANE_WIDTH_PRESETS.reduce<WorkspaceDockedPaneWidthPreset>(
    (closestPreset, candidatePreset) => {
      const closestWidth = workspacePaneDefaultWidth(
        { ...pane, widthPreset: closestPreset },
        hostWidth,
      );
      const candidateWidth = workspacePaneDefaultWidth(
        { ...pane, widthPreset: candidatePreset },
        hostWidth,
      );
      return Math.abs(candidateWidth - targetWidth) < Math.abs(closestWidth - targetWidth)
        ? candidatePreset
        : closestPreset;
    },
    workspacePaneWidthPreset(pane),
  );
}

export function workspacePaneWidth(
  pane: Pick<PersistedWorkspaceDockedPane, "paneId" | "size"> & {
    readonly type?: WorkspaceDockedPaneType;
    readonly width?: number;
    readonly widthPreset?: WorkspaceDockedPaneWidthPreset;
  },
  hostWidth: number,
): number {
  if (typeof pane.width === "number" && Number.isFinite(pane.width)) {
    return clamp(pane.width, MIN_CUSTOM_WORKSPACE_PANE_WIDTH, MAX_WORKSPACE_PANE_WIDTH);
  }
  const defaultWidth = workspacePaneDefaultWidth(pane, hostWidth);
  const size = Number.isFinite(pane.size) && pane.size > 0 ? pane.size : 1;
  return clamp(defaultWidth * size, defaultWidth, MAX_WORKSPACE_PANE_WIDTH);
}

export function workspaceTerminalRowHeight(height: number): number {
  return Number.isFinite(height) ? Math.max(MIN_WORKSPACE_TERMINAL_ROW_HEIGHT, height) : 320;
}

export function workspacePaneHeight(
  pane: { readonly height?: number },
  defaultHeight: number,
): number {
  const minimumHeight =
    Number.isFinite(defaultHeight) && defaultHeight > 0 ? defaultHeight : MIN_WORKSPACE_PANE_HEIGHT;
  return Math.min(MAX_WORKSPACE_PANE_HEIGHT, Math.max(minimumHeight, pane.height ?? minimumHeight));
}

function orderedWorkspacePanes(
  panes: readonly PersistedWorkspaceDockedPane[],
): PersistedWorkspaceDockedPane[] {
  return panes.toSorted((left, right) => {
    const byOrder = left.order - right.order;
    return byOrder !== 0 ? byOrder : left.paneId.localeCompare(right.paneId);
  });
}

function normalizePaneOrder(
  panes: readonly PersistedWorkspaceDockedPane[],
): PersistedWorkspaceDockedPane[] {
  return orderedWorkspacePanes(panes).map((pane, order) => ({ ...pane, order }));
}

export function reorderWorkspacePanes(
  panes: readonly PersistedWorkspaceDockedPane[],
  activePaneId: string,
  overPaneId: string,
): PersistedWorkspaceDockedPane[] {
  const orderedPanes = normalizePaneOrder(panes);
  const activeIndex = orderedPanes.findIndex((pane) => pane.paneId === activePaneId);
  const overIndex = orderedPanes.findIndex((pane) => pane.paneId === overPaneId);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
    return orderedPanes;
  }

  const reordered = [...orderedPanes];
  const [activePane] = reordered.splice(activeIndex, 1);
  if (!activePane) {
    return orderedPanes;
  }
  reordered.splice(overIndex, 0, activePane);
  return reordered.map((pane, order) => ({ ...pane, order }));
}

export function workspacePaneColumns(
  panes: readonly PersistedWorkspaceDockedPane[],
): readonly WorkspacePaneColumn[] {
  return normalizePaneOrder(panes).map((pane, column) => ({
    column,
    panes: [pane],
  }));
}

export function workspacePanePlacements(
  panes: readonly PersistedWorkspaceDockedPane[],
): ReadonlyMap<string, WorkspacePanePlacement> {
  const placements = new Map<string, WorkspacePanePlacement>();
  normalizePaneOrder(panes).forEach((pane, column) => {
    placements.set(pane.paneId, { slot: "grid", column, row: 0 });
  });
  return placements;
}

export function workspacePaneRects(
  panes: readonly PersistedWorkspaceDockedPane[],
  hostWidth: number,
  paneHeight: number = MIN_WORKSPACE_PANE_HEIGHT,
  _terminalRowHeight: number = 320,
): readonly WorkspacePaneRect[] {
  let x = 0;
  return normalizePaneOrder(panes).map((pane) => {
    const width = workspacePaneWidth(pane, hostWidth);
    const height = workspacePaneHeight(pane, paneHeight);
    const rect = { pane, x, y: 0, width, height };
    x += width + WORKSPACE_PANE_GAP;
    return rect;
  });
}

function withWorkspacePaneRects(
  panes: readonly PersistedWorkspaceDockedPane[],
  rects: readonly WorkspacePaneRect[],
): PersistedWorkspaceDockedPane[] {
  const rectByPaneId = new Map(rects.map((rect) => [rect.pane.paneId, rect]));
  return normalizePaneOrder(panes).map((pane, order) => {
    const rect = rectByPaneId.get(pane.paneId);
    return {
      ...pane,
      order,
      widthPreset: pane.widthPreset ?? workspacePaneWidthPreset(pane),
      dockSlot: "grid",
      dockColumn: order,
      dockRow: 0,
      dockX: Math.round(rect?.x ?? 0),
      dockY: 0,
    };
  });
}

export function normalizeWorkspacePaneLayout(
  panes: readonly PersistedWorkspaceDockedPane[],
  hostWidth: number,
  paneHeight: number = MIN_WORKSPACE_PANE_HEIGHT,
  terminalRowHeight: number = 320,
): PersistedWorkspaceDockedPane[] {
  return withWorkspacePaneRects(
    panes,
    workspacePaneRects(panes, hostWidth, paneHeight, terminalRowHeight),
  );
}

export function placeWorkspacePane(
  panes: readonly PersistedWorkspaceDockedPane[],
  activePaneId: string,
  overPaneId: string,
  direction: WorkspacePaneDropDirection,
  _hostWidth: number = 1_280,
  _paneHeight: number = MIN_WORKSPACE_PANE_HEIGHT,
  _terminalRowHeight: number = 320,
): PersistedWorkspaceDockedPane[] {
  const orderedPanes = normalizePaneOrder(panes);
  const activeIndex = orderedPanes.findIndex((pane) => pane.paneId === activePaneId);
  const overIndex = orderedPanes.findIndex((pane) => pane.paneId === overPaneId);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
    return orderedPanes;
  }

  if (direction === "swap") {
    const swapped = [...orderedPanes];
    [swapped[activeIndex], swapped[overIndex]] = [swapped[overIndex]!, swapped[activeIndex]!];
    return swapped.map((pane, order) => ({ ...pane, order }));
  }

  const reordered = [...orderedPanes];
  const [activePane] = reordered.splice(activeIndex, 1);
  if (!activePane) {
    return orderedPanes;
  }

  const targetIndex = reordered.findIndex((pane) => pane.paneId === overPaneId);
  if (targetIndex < 0) {
    return orderedPanes;
  }
  const shouldInsertAfter = direction === "after" || direction === "below";
  reordered.splice(targetIndex + (shouldInsertAfter ? 1 : 0), 0, activePane);
  return reordered.map((pane, order) => ({ ...pane, order }));
}

export function pushWorkspacePaneCollisions(
  panes: readonly PersistedWorkspaceDockedPane[],
  _paneId: string,
  _axis: "horizontal" | "vertical",
  hostWidth: number,
  paneHeight: number,
  terminalRowHeight: number,
): PersistedWorkspaceDockedPane[] {
  return normalizeWorkspacePaneLayout(panes, hostWidth, paneHeight, terminalRowHeight);
}

export function resizeWorkspacePaneWidth(
  panes: readonly PersistedWorkspaceDockedPane[],
  paneId: string,
  width: number,
  _hostWidth: number,
): PersistedWorkspaceDockedPane[] {
  if (!Number.isFinite(width)) {
    return normalizePaneOrder(panes);
  }
  return normalizePaneOrder(panes).map((pane) => {
    if (pane.paneId !== paneId) {
      return pane;
    }

    const { width: _width, ...paneWithoutCustomWidth } = pane;
    return {
      ...paneWithoutCustomWidth,
      widthPreset: workspacePaneWidthPresetForWidth(pane, width, _hostWidth),
      size: 1,
    };
  });
}

export function cycleWorkspacePaneWidthPreset(
  panes: readonly PersistedWorkspaceDockedPane[],
  paneId: string,
  direction: "previous" | "next",
): PersistedWorkspaceDockedPane[] {
  const orderedPanes = normalizePaneOrder(panes);
  if (!orderedPanes.some((pane) => pane.paneId === paneId)) {
    return orderedPanes;
  }

  return orderedPanes.map((pane) => {
    if (pane.paneId !== paneId) {
      return pane;
    }

    const currentIndex = WORKSPACE_PANE_WIDTH_PRESETS.indexOf(workspacePaneWidthPreset(pane));
    const delta = direction === "previous" ? -1 : 1;
    const nextPreset =
      WORKSPACE_PANE_WIDTH_PRESETS[
        (currentIndex + delta + WORKSPACE_PANE_WIDTH_PRESETS.length) %
          WORKSPACE_PANE_WIDTH_PRESETS.length
      ]!;
    const { width: _width, ...paneWithoutCustomWidth } = pane;
    return {
      ...paneWithoutCustomWidth,
      widthPreset: nextPreset,
      size: 1,
    };
  });
}

export function setWorkspacePaneWidthPreset(
  panes: readonly PersistedWorkspaceDockedPane[],
  paneId: string,
  widthPreset: WorkspaceDockedPaneWidthPreset,
): PersistedWorkspaceDockedPane[] {
  const orderedPanes = normalizePaneOrder(panes);
  if (!WORKSPACE_PANE_WIDTH_PRESETS.includes(widthPreset)) {
    return orderedPanes;
  }
  return orderedPanes.map((pane) => {
    if (pane.paneId !== paneId) {
      return pane;
    }

    const { width: _width, ...paneWithoutCustomWidth } = pane;
    return {
      ...paneWithoutCustomWidth,
      widthPreset,
      size: 1,
    };
  });
}

export function resizeWorkspacePaneHeight(
  panes: readonly PersistedWorkspaceDockedPane[],
  paneId: string,
  height: number,
  defaultHeight: number,
): PersistedWorkspaceDockedPane[] {
  if (!Number.isFinite(height)) {
    return normalizePaneOrder(panes);
  }
  return normalizePaneOrder(panes).map((pane) =>
    pane.paneId === paneId
      ? {
          ...pane,
          height: workspacePaneHeight({ height }, defaultHeight),
        }
      : pane,
  );
}

export function mergeVisibleWorkspacePaneUpdates(
  panes: readonly PersistedWorkspaceDockedPane[],
  visiblePanes: readonly PersistedWorkspaceDockedPane[],
): PersistedWorkspaceDockedPane[] {
  const visiblePaneById = new Map(visiblePanes.map((pane) => [pane.paneId, pane]));
  const hiddenPanes = panes.filter((pane) => !visiblePaneById.has(pane.paneId));
  return normalizePaneOrder([...visiblePanes, ...hiddenPanes]);
}
