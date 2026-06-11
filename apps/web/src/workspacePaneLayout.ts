import type { PersistedWorkspaceDockedPane, WorkspaceDockedPaneSlot } from "./uiStateStore";

export const MIN_WORKSPACE_TERMINAL_ROW_HEIGHT = 280;
export const MIN_WORKSPACE_PANE_HEIGHT = 736;

const MAX_WORKSPACE_PANE_WIDTH = 1_400;
const MAX_WORKSPACE_PANE_HEIGHT = 4_000;
const EDITOR_DEFAULT_WIDTH_RATIO = 0.56;
const SUPPORTING_PANE_DEFAULT_WIDTH_RATIO = 0.44;
const EDITOR_MIN_DEFAULT_WIDTH = 512;
const SUPPORTING_PANE_MIN_DEFAULT_WIDTH = 384;

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
    Number.isFinite(defaultHeight) && defaultHeight > 0 ? defaultHeight : MIN_WORKSPACE_PANE_HEIGHT;
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

function persistedWorkspacePanePlacements(
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

export function workspacePaneColumns(
  panes: readonly PersistedWorkspaceDockedPane[],
): readonly WorkspacePaneColumn[] {
  const placements = persistedWorkspacePanePlacements(panes);
  const hasLegacySlots = panes.some((pane) => {
    const slot = placements.get(pane.paneId)?.slot;
    return slot === "primary" || slot === "upper";
  });
  const groupedPanes = new Map<string, PersistedWorkspaceDockedPane[]>();

  for (const pane of panes) {
    const placement = placements.get(pane.paneId);
    if (!placement) {
      continue;
    }
    const key = hasLegacySlots
      ? placement.slot === "primary"
        ? `primary:${placement.column}`
        : `supporting:${placement.column}`
      : `grid:${placement.column}`;
    const column = groupedPanes.get(key) ?? [];
    column.push(pane);
    groupedPanes.set(key, column);
  }

  const columnKeys = [...groupedPanes.keys()].toSorted((left, right) => {
    const [leftGroup, leftColumnText] = left.split(":");
    const [rightGroup, rightColumnText] = right.split(":");
    const leftGroupOrder = leftGroup === "primary" ? 0 : 1;
    const rightGroupOrder = rightGroup === "primary" ? 0 : 1;
    return leftGroupOrder - rightGroupOrder || Number(leftColumnText) - Number(rightColumnText);
  });

  return columnKeys.map((key, column) => ({
    column,
    panes: (groupedPanes.get(key) ?? []).toSorted((left, right) => {
      const leftPlacement = placements.get(left.paneId);
      const rightPlacement = placements.get(right.paneId);
      if (!leftPlacement || !rightPlacement) {
        return left.order - right.order;
      }
      const slotRowOffset = hasLegacySlots && leftPlacement.slot === "grid" ? 1_000_000 : 0;
      const rightSlotRowOffset = hasLegacySlots && rightPlacement.slot === "grid" ? 1_000_000 : 0;
      return (
        slotRowOffset + leftPlacement.row - (rightSlotRowOffset + rightPlacement.row) ||
        left.order - right.order
      );
    }),
  }));
}

export function workspacePanePlacements(
  panes: readonly PersistedWorkspaceDockedPane[],
): ReadonlyMap<string, WorkspacePanePlacement> {
  const placements = new Map<string, WorkspacePanePlacement>();
  for (const column of workspacePaneColumns(panes)) {
    column.panes.forEach((pane, row) => {
      placements.set(pane.paneId, { slot: "grid", column: column.column, row });
    });
  }
  return placements;
}

function withNormalizedWorkspacePaneColumns(
  panes: readonly PersistedWorkspaceDockedPane[],
  columns: readonly (readonly string[])[],
): PersistedWorkspaceDockedPane[] {
  const paneById = new Map(panes.map((pane) => [pane.paneId, pane]));
  return columns
    .flatMap((paneIds, column) =>
      paneIds.flatMap((paneId, row) => {
        const pane = paneById.get(paneId);
        return pane
          ? [
              Object.assign({}, pane, {
                order: column + row,
                dockSlot: "grid" as const,
                dockColumn: column,
                dockRow: row,
              }),
            ]
          : [];
      }),
    )
    .map((pane, order) => Object.assign({}, pane, { order }));
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
  const columns = workspacePaneColumns(panes).map((column) =>
    column.panes.map((pane) => pane.paneId),
  );
  const activeColumnIndex = columns.findIndex((paneIds) => paneIds.includes(activePaneId));
  const overColumnIndex = columns.findIndex((paneIds) => paneIds.includes(overPaneId));
  if (activeColumnIndex < 0 || overColumnIndex < 0) {
    return [...panes];
  }
  const activeRowIndex = columns[activeColumnIndex]!.indexOf(activePaneId);
  const overRowIndex = columns[overColumnIndex]!.indexOf(overPaneId);
  if (direction === "swap") {
    columns[activeColumnIndex]![activeRowIndex] = overPaneId;
    columns[overColumnIndex]![overRowIndex] = activePaneId;
    return withNormalizedWorkspacePaneColumns(panes, columns);
  }

  columns[activeColumnIndex]!.splice(activeRowIndex, 1);
  if (columns[activeColumnIndex]!.length === 0) {
    columns.splice(activeColumnIndex, 1);
  }
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
  return withNormalizedWorkspacePaneColumns(panes, columns);
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
