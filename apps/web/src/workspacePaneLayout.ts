import type { PersistedWorkspaceDockedPane, WorkspaceDockedPaneSlot } from "./uiStateStore";

export const MIN_WORKSPACE_TERMINAL_ROW_HEIGHT = 280;
export const MIN_WORKSPACE_PANE_HEIGHT = 736;

const MAX_WORKSPACE_PANE_WIDTH = 1_400;
const MAX_WORKSPACE_PANE_HEIGHT = 4_000;
const EDITOR_DEFAULT_WIDTH_RATIO = 0.56;
const SUPPORTING_PANE_DEFAULT_WIDTH_RATIO = 0.44;
const EDITOR_MIN_DEFAULT_WIDTH = 512;
const SUPPORTING_PANE_MIN_DEFAULT_WIDTH = 384;

export type WorkspacePaneDropDirection = "above" | "below" | "before" | "after";

export interface WorkspacePanePlacement {
  readonly slot: WorkspaceDockedPaneSlot;
  readonly column: number;
  readonly row: number;
}

export function workspacePaneDefaultWidth(
  pane: Pick<PersistedWorkspaceDockedPane, "paneId">,
  hostWidth: number,
): number {
  const safeHostWidth = Number.isFinite(hostWidth) && hostWidth > 0 ? hostWidth : 1_280;
  return pane.paneId === "editor"
    ? Math.max(EDITOR_MIN_DEFAULT_WIDTH, safeHostWidth * EDITOR_DEFAULT_WIDTH_RATIO)
    : Math.max(
        SUPPORTING_PANE_MIN_DEFAULT_WIDTH,
        safeHostWidth * SUPPORTING_PANE_DEFAULT_WIDTH_RATIO,
      );
}

export function workspacePaneWidth(
  pane: Pick<PersistedWorkspaceDockedPane, "paneId" | "size">,
  hostWidth: number,
): number {
  const defaultWidth = workspacePaneDefaultWidth(pane, hostWidth);
  return Math.min(MAX_WORKSPACE_PANE_WIDTH, Math.max(defaultWidth, defaultWidth * pane.size));
}

export function workspaceTerminalRowHeight(height: number): number {
  return Number.isFinite(height) ? Math.max(MIN_WORKSPACE_TERMINAL_ROW_HEIGHT, height) : 320;
}

export function workspacePaneHeight(
  pane: Pick<PersistedWorkspaceDockedPane, "height">,
  defaultHeight: number,
): number {
  const minimumHeight =
    Number.isFinite(defaultHeight) && defaultHeight > 0
      ? Math.max(MIN_WORKSPACE_PANE_HEIGHT, defaultHeight)
      : MIN_WORKSPACE_PANE_HEIGHT;
  return Math.min(MAX_WORKSPACE_PANE_HEIGHT, Math.max(minimumHeight, pane.height ?? minimumHeight));
}

export function reorderWorkspacePanes(
  panes: readonly PersistedWorkspaceDockedPane[],
  activePaneId: string,
  overPaneId: string,
): PersistedWorkspaceDockedPane[] {
  const activeIndex = panes.findIndex((pane) => pane.paneId === activePaneId);
  const overIndex = panes.findIndex((pane) => pane.paneId === overPaneId);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
    return [...panes];
  }

  const reordered = [...panes];
  const [activePane] = reordered.splice(activeIndex, 1);
  if (!activePane) {
    return [...panes];
  }
  reordered.splice(overIndex, 0, activePane);
  return reordered.map((pane, index) => Object.assign({}, pane, { order: index }));
}

export function workspacePanePlacements(
  panes: readonly PersistedWorkspaceDockedPane[],
): ReadonlyMap<string, WorkspacePanePlacement> {
  const placements = new Map<string, WorkspacePanePlacement>();
  let fallbackGridColumn =
    panes.reduce(
      (maxColumn, pane) =>
        pane.dockSlot === "grid" && pane.dockColumn !== undefined
          ? Math.max(maxColumn, pane.dockColumn)
          : maxColumn,
      -1,
    ) + 1;

  for (const pane of panes) {
    if (
      pane.dockSlot !== undefined &&
      pane.dockColumn !== undefined &&
      pane.dockRow !== undefined
    ) {
      placements.set(pane.paneId, {
        slot: pane.dockSlot,
        column: pane.dockColumn,
        row: pane.dockRow,
      });
      continue;
    }
    if (pane.paneId === "editor") {
      placements.set(pane.paneId, { slot: "primary", column: 0, row: 0 });
      continue;
    }
    if (pane.paneId === "ai") {
      placements.set(pane.paneId, { slot: "upper", column: 0, row: 0 });
      continue;
    }
    placements.set(pane.paneId, { slot: "grid", column: fallbackGridColumn, row: 0 });
    fallbackGridColumn += 1;
  }

  return placements;
}

function withNormalizedWorkspacePanePlacements(
  panes: readonly PersistedWorkspaceDockedPane[],
  placements: ReadonlyMap<string, WorkspacePanePlacement>,
): PersistedWorkspaceDockedPane[] {
  const sortedPanes = [...panes].toSorted((left, right) => {
    const leftPlacement = placements.get(left.paneId);
    const rightPlacement = placements.get(right.paneId);
    if (!leftPlacement || !rightPlacement) {
      return left.order - right.order;
    }
    const slotOrder = { primary: 0, upper: 1, grid: 2 } as const;
    return (
      slotOrder[leftPlacement.slot] - slotOrder[rightPlacement.slot] ||
      leftPlacement.column - rightPlacement.column ||
      leftPlacement.row - rightPlacement.row ||
      left.order - right.order
    );
  });

  return sortedPanes.map((pane, order) => {
    const placement = placements.get(pane.paneId);
    return placement
      ? Object.assign({}, pane, {
          order,
          dockSlot: placement.slot,
          dockColumn: placement.column,
          dockRow: placement.row,
        })
      : Object.assign({}, pane, { order });
  });
}

export function placeWorkspacePane(
  panes: readonly PersistedWorkspaceDockedPane[],
  activePaneId: string,
  overPaneId: string,
  direction: WorkspacePaneDropDirection,
): PersistedWorkspaceDockedPane[] {
  if (activePaneId === overPaneId) {
    return [...panes];
  }
  const placements = new Map(workspacePanePlacements(panes));
  const activePlacement = placements.get(activePaneId);
  const overPlacement = placements.get(overPaneId);
  if (!activePlacement || !overPlacement) {
    return [...panes];
  }

  const isHorizontalDrop = direction === "before" || direction === "after";
  if (overPlacement.slot === "upper" && activePlacement.slot !== "primary" && isHorizontalDrop) {
    const upperPaneIds = panes
      .filter((pane) => placements.get(pane.paneId)?.slot === "upper")
      .toSorted(
        (left, right) =>
          (placements.get(left.paneId)?.column ?? 0) - (placements.get(right.paneId)?.column ?? 0),
      )
      .map((pane) => pane.paneId)
      .filter((paneId) => paneId !== activePaneId);
    const targetIndex = upperPaneIds.indexOf(overPaneId);
    if (targetIndex < 0) {
      return [...panes];
    }
    upperPaneIds.splice(targetIndex + (direction === "after" ? 1 : 0), 0, activePaneId);
    upperPaneIds.forEach((paneId, column) => {
      placements.set(paneId, { slot: "upper", column, row: 0 });
    });
    return withNormalizedWorkspacePanePlacements(panes, placements);
  }

  if (activePlacement.slot !== "grid" || overPlacement.slot !== "grid") {
    placements.set(activePaneId, overPlacement);
    placements.set(overPaneId, activePlacement);
    return withNormalizedWorkspacePanePlacements(panes, placements);
  }

  const gridColumns = new Map<number, string[]>();
  for (const pane of panes) {
    const placement = placements.get(pane.paneId);
    if (placement?.slot !== "grid") {
      continue;
    }
    const column = gridColumns.get(placement.column) ?? [];
    column.push(pane.paneId);
    gridColumns.set(placement.column, column);
  }
  for (const column of gridColumns.values()) {
    column.sort(
      (leftPaneId, rightPaneId) =>
        (placements.get(leftPaneId)?.row ?? 0) - (placements.get(rightPaneId)?.row ?? 0),
    );
  }

  const columns = [...gridColumns.entries()]
    .toSorted(([leftColumn], [rightColumn]) => leftColumn - rightColumn)
    .map(([, paneIds]) => paneIds.filter((paneId) => paneId !== activePaneId))
    .filter((paneIds) => paneIds.length > 0);
  const targetColumnIndex = columns.findIndex((paneIds) => paneIds.includes(overPaneId));
  if (targetColumnIndex < 0) {
    return [...panes];
  }

  if (direction === "above" || direction === "below") {
    const targetColumn = columns[targetColumnIndex]!;
    const targetRow = targetColumn.indexOf(overPaneId);
    targetColumn.splice(targetRow + (direction === "below" ? 1 : 0), 0, activePaneId);
  } else {
    columns.splice(targetColumnIndex + (direction === "after" ? 1 : 0), 0, [activePaneId]);
  }

  columns.forEach((paneIds, column) => {
    paneIds.forEach((paneId, row) => {
      placements.set(paneId, { slot: "grid", column, row });
    });
  });
  return withNormalizedWorkspacePanePlacements(panes, placements);
}

export function resizeWorkspacePaneHeight(
  panes: readonly PersistedWorkspaceDockedPane[],
  paneId: string,
  height: number,
  defaultHeight: number,
): PersistedWorkspaceDockedPane[] {
  if (!Number.isFinite(height)) {
    return [...panes];
  }
  return panes.map((pane) =>
    pane.paneId === paneId
      ? Object.assign({}, pane, {
          height: workspacePaneHeight({ height }, defaultHeight),
        })
      : pane,
  );
}

export function mergeVisibleWorkspacePaneUpdates(
  panes: readonly PersistedWorkspaceDockedPane[],
  visiblePanes: readonly PersistedWorkspaceDockedPane[],
): PersistedWorkspaceDockedPane[] {
  const visiblePaneIds = new Set(visiblePanes.map((pane) => pane.paneId));
  let visibleIndex = 0;
  return panes.map((pane, index) => {
    if (!visiblePaneIds.has(pane.paneId)) {
      return Object.assign({}, pane, { order: index });
    }
    const visiblePane = visiblePanes[visibleIndex++];
    return Object.assign({}, visiblePane ?? pane, { order: index });
  });
}

export function resizeAdjacentWorkspacePanes(
  panes: readonly PersistedWorkspaceDockedPane[],
  leadingPaneId: string,
  delta: number,
  hostWidth: number,
): PersistedWorkspaceDockedPane[] {
  const leadingIndex = panes.findIndex((pane) => pane.paneId === leadingPaneId);
  const trailingIndex = leadingIndex + 1;
  const leadingPane = panes[leadingIndex];
  const trailingPane = panes[trailingIndex];
  if (!leadingPane || !trailingPane || !Number.isFinite(delta)) {
    return [...panes];
  }

  const leadingWidth = workspacePaneWidth(leadingPane, hostWidth);
  const trailingWidth = workspacePaneWidth(trailingPane, hostWidth);
  const leadingMinimumWidth = workspacePaneDefaultWidth(leadingPane, hostWidth);
  const trailingMinimumWidth = workspacePaneDefaultWidth(trailingPane, hostWidth);
  const leadingDelta = Math.min(
    Math.max(delta, leadingMinimumWidth - leadingWidth),
    MAX_WORKSPACE_PANE_WIDTH - leadingWidth,
  );
  if (leadingDelta === 0) {
    return [...panes];
  }

  const trailingDelta =
    leadingDelta > 0
      ? -Math.min(leadingDelta, trailingWidth - trailingMinimumWidth)
      : Math.min(-leadingDelta, MAX_WORKSPACE_PANE_WIDTH - trailingWidth);
  const nextLeadingSize = (leadingWidth + leadingDelta) / leadingMinimumWidth;
  const nextTrailingSize = (trailingWidth + trailingDelta) / trailingMinimumWidth;

  return panes.map((pane, index) => {
    if (index === leadingIndex) {
      return Object.assign({}, pane, { size: nextLeadingSize });
    }
    if (index === trailingIndex) {
      return Object.assign({}, pane, { size: nextTrailingSize });
    }
    return pane;
  });
}
