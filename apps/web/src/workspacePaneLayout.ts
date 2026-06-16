import type { PersistedWorkspaceDockedPane, WorkspaceDockedPaneSlot } from "./uiStateStore";

export const MIN_WORKSPACE_TERMINAL_ROW_HEIGHT = 280;
export const MIN_WORKSPACE_PANE_HEIGHT = 736;
export const WORKSPACE_PANE_GAP = 12;

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

export interface WorkspacePaneRect {
  readonly pane: PersistedWorkspaceDockedPane;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
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

function workspacePaneDefaultHeight(
  pane: PersistedWorkspaceDockedPane,
  paneHeight: number,
  terminalRowHeight: number,
): number {
  return pane.type === "terminal" ? terminalRowHeight : paneHeight;
}

export function workspacePaneRects(
  panes: readonly PersistedWorkspaceDockedPane[],
  hostWidth: number,
  paneHeight: number = MIN_WORKSPACE_PANE_HEIGHT,
  terminalRowHeight: number = 320,
): readonly WorkspacePaneRect[] {
  const positionedPanes = panes.filter(
    (pane) => pane.dockX !== undefined && pane.dockY !== undefined,
  );
  if (positionedPanes.length > 0) {
    let nextX = positionedPanes.reduce(
      (right, pane) => Math.max(right, pane.dockX! + workspacePaneWidth(pane, hostWidth)),
      0,
    );
    return repairWorkspacePaneRectCollisions(
      panes.map((pane) => {
        const width = workspacePaneWidth(pane, hostWidth);
        const defaultHeight = workspacePaneDefaultHeight(pane, paneHeight, terminalRowHeight);
        const rect = {
          pane,
          x: pane.dockX ?? nextX + (nextX > 0 ? WORKSPACE_PANE_GAP : 0),
          y: pane.dockY ?? 0,
          width,
          height: workspacePaneHeight(pane, defaultHeight),
        };
        if (pane.dockX === undefined || pane.dockY === undefined) {
          nextX = rect.x + width;
        }
        return rect;
      }),
    );
  }

  let x = 0;
  return repairWorkspacePaneRectCollisions(
    workspacePaneColumns(panes).flatMap((column) => {
      let y = 0;
      const rects = column.panes.map((pane) => {
        const width = workspacePaneWidth(pane, hostWidth);
        const defaultHeight = workspacePaneDefaultHeight(pane, paneHeight, terminalRowHeight);
        const height = workspacePaneHeight(pane, defaultHeight);
        const rect = { pane, x, y, width, height };
        y += height + WORKSPACE_PANE_GAP;
        return rect;
      });
      x += Math.max(...rects.map((rect) => rect.width), 0) + WORKSPACE_PANE_GAP;
      return rects;
    }),
  );
}

function workspacePaneRectsIntersect(left: WorkspacePaneRect, right: WorkspacePaneRect): boolean {
  return (
    left.x < right.x + right.width + WORKSPACE_PANE_GAP &&
    left.x + left.width + WORKSPACE_PANE_GAP > right.x &&
    left.y < right.y + right.height + WORKSPACE_PANE_GAP &&
    left.y + left.height + WORKSPACE_PANE_GAP > right.y
  );
}

function rebaseWorkspacePaneRects(rects: readonly WorkspacePaneRect[]): WorkspacePaneRect[] {
  if (rects.length === 0) {
    return [];
  }
  const minimumX = Math.min(...rects.map((rect) => rect.x));
  const minimumY = Math.min(...rects.map((rect) => rect.y));
  if (minimumX === 0 && minimumY === 0) {
    return rects.map((rect) => ({ ...rect }));
  }
  return rects.map((rect) => ({
    ...rect,
    x: rect.x - minimumX,
    y: rect.y - minimumY,
  }));
}

function repairWorkspacePaneRectCollisions(
  rects: readonly WorkspacePaneRect[],
): WorkspacePaneRect[] {
  const repaired: WorkspacePaneRect[] = [];
  for (const sourceRect of rebaseWorkspacePaneRects(rects)) {
    let rect = { ...sourceRect };
    let blocker = repaired.find((candidate) => workspacePaneRectsIntersect(candidate, rect));
    while (blocker) {
      const horizontalOffset = Math.abs(sourceRect.x - blocker.x);
      const verticalOffset = Math.abs(sourceRect.y - blocker.y);
      rect =
        horizontalOffset >= verticalOffset
          ? { ...rect, x: blocker.x + blocker.width + WORKSPACE_PANE_GAP }
          : { ...rect, y: blocker.y + blocker.height + WORKSPACE_PANE_GAP };
      blocker = repaired.find((candidate) => workspacePaneRectsIntersect(candidate, rect));
    }
    repaired.push(rect);
  }
  return rebaseWorkspacePaneRects(repaired);
}

function repairDefaultWorkspacePaneGutter(
  rects: readonly WorkspacePaneRect[],
): WorkspacePaneRect[] {
  const editor = rects.find((rect) => rect.pane.paneId === "editor");
  const ai = rects.find((rect) => rect.pane.paneId === "ai");
  if (!editor || !ai || ai.x <= editor.x) {
    return rects.map((rect) => ({ ...rect }));
  }

  const sharesRow = editor.y < ai.y + ai.height && editor.y + editor.height > ai.y;
  const hasPaneBetween = rects.some(
    (rect) =>
      rect.pane.paneId !== editor.pane.paneId &&
      rect.pane.paneId !== ai.pane.paneId &&
      rect.y < ai.y + ai.height &&
      rect.y + rect.height > ai.y &&
      rect.x >= editor.x + editor.width &&
      rect.x + rect.width <= ai.x,
  );
  if (!sharesRow || hasPaneBetween) {
    return rects.map((rect) => ({ ...rect }));
  }

  const expectedAiX = editor.x + editor.width + WORKSPACE_PANE_GAP;
  if (ai.x <= expectedAiX) {
    return rects.map((rect) => ({ ...rect }));
  }
  return rects.map((rect) =>
    rect.pane.paneId === ai.pane.paneId ? { ...rect, x: expectedAiX } : { ...rect },
  );
}

function repairDefaultWorkspacePaneTopRow(
  rects: readonly WorkspacePaneRect[],
): WorkspacePaneRect[] {
  const editor = rects.find((rect) => rect.pane.paneId === "editor");
  const ai = rects.find((rect) => rect.pane.paneId === "ai");
  if (!editor || !ai || editor.y === ai.y) {
    return rects.map((rect) => ({ ...rect }));
  }

  const targetY = Math.min(editor.y, ai.y);
  const loweredDefaults = [editor, ai]
    .filter((rect) => rect.y > targetY)
    .map((rect) => ({ delta: rect.y - targetY, y: rect.y }));
  const defaultRects = [editor, ai].map((rect) => Object.assign({}, rect, { y: targetY }));
  if (workspacePaneRectsIntersect(defaultRects[0]!, defaultRects[1]!)) {
    return rects.map((rect) => ({ ...rect }));
  }

  const repaired: WorkspacePaneRect[] = [];
  for (const rect of rects) {
    if (rect.pane.paneId === editor.pane.paneId) {
      repaired.push(defaultRects[0]!);
      continue;
    }
    if (rect.pane.paneId === ai.pane.paneId) {
      repaired.push(defaultRects[1]!);
      continue;
    }

    const liftDelta = Math.max(
      0,
      ...loweredDefaults.filter((lowered) => rect.y >= lowered.y).map((lowered) => lowered.delta),
    );
    if (liftDelta > 0) {
      const lifted = { ...rect, y: rect.y - liftDelta };
      if (!defaultRects.some((defaultRect) => workspacePaneRectsIntersect(defaultRect, lifted))) {
        repaired.push(lifted);
        continue;
      }
    }

    if (defaultRects.some((defaultRect) => workspacePaneRectsIntersect(defaultRect, rect))) {
      return rects.map((sourceRect) => ({ ...sourceRect }));
    }
    repaired.push({ ...rect });
  }
  return repaired;
}

function pushWorkspacePaneRects(
  rects: readonly WorkspacePaneRect[],
  anchorPaneId: string,
  axis: "horizontal" | "vertical",
  direction: -1 | 1,
): WorkspacePaneRect[] {
  const nextRects = rects.map((rect) => ({ ...rect }));
  const queuedPaneIds = [anchorPaneId];
  const fixedPaneIds = new Set([anchorPaneId]);

  while (queuedPaneIds.length > 0) {
    const currentPaneId = queuedPaneIds.shift()!;
    const current = nextRects.find((rect) => rect.pane.paneId === currentPaneId);
    if (!current) {
      continue;
    }
    for (let index = 0; index < nextRects.length; index += 1) {
      const other = nextRects[index]!;
      if (fixedPaneIds.has(other.pane.paneId) || !workspacePaneRectsIntersect(current, other)) {
        continue;
      }
      let moved =
        axis === "horizontal"
          ? {
              ...other,
              x:
                direction > 0
                  ? current.x + current.width + WORKSPACE_PANE_GAP
                  : current.x - other.width - WORKSPACE_PANE_GAP,
            }
          : {
              ...other,
              y:
                direction > 0
                  ? current.y + current.height + WORKSPACE_PANE_GAP
                  : current.y - other.height - WORKSPACE_PANE_GAP,
            };
      let blockingRect = nextRects.find(
        (rect) =>
          rect.pane.paneId !== moved.pane.paneId &&
          fixedPaneIds.has(rect.pane.paneId) &&
          workspacePaneRectsIntersect(moved, rect),
      );
      while (blockingRect) {
        moved =
          axis === "horizontal"
            ? Object.assign({}, moved, {
                x:
                  direction > 0
                    ? blockingRect.x + blockingRect.width + WORKSPACE_PANE_GAP
                    : blockingRect.x - moved.width - WORKSPACE_PANE_GAP,
              })
            : Object.assign({}, moved, {
                y:
                  direction > 0
                    ? blockingRect.y + blockingRect.height + WORKSPACE_PANE_GAP
                    : blockingRect.y - moved.height - WORKSPACE_PANE_GAP,
              });
        blockingRect = nextRects.find(
          (rect) =>
            rect.pane.paneId !== moved.pane.paneId &&
            fixedPaneIds.has(rect.pane.paneId) &&
            workspacePaneRectsIntersect(moved, rect),
        );
      }
      nextRects[index] = moved;
      fixedPaneIds.add(moved.pane.paneId);
      queuedPaneIds.push(moved.pane.paneId);
    }
  }

  return rebaseWorkspacePaneRects(nextRects);
}

function workspacePaneRectsOverlapOnPerpendicularAxis(
  left: WorkspacePaneRect,
  right: WorkspacePaneRect,
  axis: "horizontal" | "vertical",
): boolean {
  return axis === "horizontal"
    ? left.y < right.y + right.height && left.y + left.height > right.y
    : left.x < right.x + right.width && left.x + left.width > right.x;
}

function compactWorkspacePaneRects(
  rects: readonly WorkspacePaneRect[],
  anchorPaneId: string,
  axis: "horizontal" | "vertical",
): WorkspacePaneRect[] {
  const nextRects = rebaseWorkspacePaneRects(rects).map((rect) => Object.assign({}, rect));
  const queuedPaneIds = [anchorPaneId];
  const fixedPaneIds = new Set([anchorPaneId]);

  while (queuedPaneIds.length > 0) {
    const currentPaneId = queuedPaneIds.shift()!;
    const current = nextRects.find((rect) => rect.pane.paneId === currentPaneId);
    if (!current) {
      continue;
    }

    const candidates = nextRects
      .filter(
        (candidate) =>
          !fixedPaneIds.has(candidate.pane.paneId) &&
          workspacePaneRectsOverlapOnPerpendicularAxis(current, candidate, axis) &&
          (axis === "horizontal"
            ? candidate.x >= current.x + current.width + WORKSPACE_PANE_GAP
            : candidate.y >= current.y + current.height + WORKSPACE_PANE_GAP),
      )
      .toSorted((left, right) => (axis === "horizontal" ? left.x - right.x : left.y - right.y));

    for (const candidate of candidates) {
      if (fixedPaneIds.has(candidate.pane.paneId)) {
        continue;
      }

      const target =
        axis === "horizontal"
          ? current.x + current.width + WORKSPACE_PANE_GAP
          : current.y + current.height + WORKSPACE_PANE_GAP;
      const currentCoordinate = axis === "horizontal" ? candidate.x : candidate.y;
      if (currentCoordinate <= target) {
        fixedPaneIds.add(candidate.pane.paneId);
        queuedPaneIds.push(candidate.pane.paneId);
        continue;
      }

      let moved =
        axis === "horizontal"
          ? Object.assign({}, candidate, { x: target })
          : Object.assign({}, candidate, { y: target });
      let blockingRect = nextRects.find(
        (rect) =>
          rect.pane.paneId !== moved.pane.paneId &&
          fixedPaneIds.has(rect.pane.paneId) &&
          workspacePaneRectsIntersect(moved, rect),
      );
      while (blockingRect) {
        moved =
          axis === "horizontal"
            ? Object.assign({}, moved, {
                x: blockingRect.x + blockingRect.width + WORKSPACE_PANE_GAP,
              })
            : Object.assign({}, moved, {
                y: blockingRect.y + blockingRect.height + WORKSPACE_PANE_GAP,
              });
        blockingRect = nextRects.find(
          (rect) =>
            rect.pane.paneId !== moved.pane.paneId &&
            fixedPaneIds.has(rect.pane.paneId) &&
            workspacePaneRectsIntersect(moved, rect),
        );
      }

      const movedIndex = nextRects.findIndex((rect) => rect.pane.paneId === moved.pane.paneId);
      if (movedIndex >= 0) {
        nextRects[movedIndex] = moved;
      }
      fixedPaneIds.add(moved.pane.paneId);
      queuedPaneIds.push(moved.pane.paneId);
    }
  }

  return rebaseWorkspacePaneRects(nextRects);
}

function withWorkspacePaneRects(
  panes: readonly PersistedWorkspaceDockedPane[],
  rects: readonly WorkspacePaneRect[],
): PersistedWorkspaceDockedPane[] {
  const rectByPaneId = new Map(rects.map((rect) => [rect.pane.paneId, rect]));
  return panes.map((pane, order) => {
    const rect = rectByPaneId.get(pane.paneId);
    return rect
      ? Object.assign({}, pane, {
          order,
          dockSlot: "grid" as const,
          dockX: Math.round(rect.x),
          dockY: Math.round(rect.y),
        })
      : Object.assign({}, pane, { order });
  });
}

export function normalizeWorkspacePaneLayout(
  panes: readonly PersistedWorkspaceDockedPane[],
  hostWidth: number,
  paneHeight: number = MIN_WORKSPACE_PANE_HEIGHT,
  terminalRowHeight: number = 320,
): PersistedWorkspaceDockedPane[] {
  const repairedRects = repairWorkspacePaneRectCollisions(
    workspacePaneRects(panes, hostWidth, paneHeight, terminalRowHeight),
  );
  const repairedTopRow = repairDefaultWorkspacePaneTopRow(repairedRects);
  return withWorkspacePaneRects(
    panes,
    repairWorkspacePaneRectCollisions(repairDefaultWorkspacePaneGutter(repairedTopRow)),
  );
}

export function placeWorkspacePane(
  panes: readonly PersistedWorkspaceDockedPane[],
  activePaneId: string,
  overPaneId: string,
  direction: WorkspacePaneDropDirection,
  hostWidth: number = 1_280,
  paneHeight: number = MIN_WORKSPACE_PANE_HEIGHT,
  terminalRowHeight: number = 320,
): PersistedWorkspaceDockedPane[] {
  if (activePaneId === overPaneId) {
    return [...panes];
  }
  const rects = workspacePaneRects(panes, hostWidth, paneHeight, terminalRowHeight);
  const active = rects.find((rect) => rect.pane.paneId === activePaneId);
  const over = rects.find((rect) => rect.pane.paneId === overPaneId);
  if (!active || !over) {
    return [...panes];
  }
  if (direction === "swap") {
    return withWorkspacePaneRects(
      panes,
      rects.map((rect) => {
        if (rect.pane.paneId === activePaneId) {
          return { ...rect, x: over.x, y: over.y };
        }
        if (rect.pane.paneId === overPaneId) {
          return { ...rect, x: active.x, y: active.y };
        }
        return rect;
      }),
    );
  }

  const placedActive =
    direction === "before"
      ? { ...active, x: over.x - active.width - WORKSPACE_PANE_GAP, y: over.y }
      : direction === "after"
        ? { ...active, x: over.x + over.width + WORKSPACE_PANE_GAP, y: over.y }
        : direction === "above"
          ? { ...active, x: over.x, y: over.y - active.height - WORKSPACE_PANE_GAP }
          : { ...active, x: over.x, y: over.y + over.height + WORKSPACE_PANE_GAP };
  const placedRects = rects.map((rect) =>
    rect.pane.paneId === activePaneId ? placedActive : rect,
  );
  const pushedRects = pushWorkspacePaneRects(
    placedRects,
    activePaneId,
    direction === "before" || direction === "after" ? "horizontal" : "vertical",
    direction === "before" || direction === "above" ? -1 : 1,
  );
  return withWorkspacePaneRects(panes, pushedRects);
}

export function pushWorkspacePaneCollisions(
  panes: readonly PersistedWorkspaceDockedPane[],
  paneId: string,
  axis: "horizontal" | "vertical",
  hostWidth: number,
  paneHeight: number,
  terminalRowHeight: number,
): PersistedWorkspaceDockedPane[] {
  const pushedRects = pushWorkspacePaneRects(
    workspacePaneRects(panes, hostWidth, paneHeight, terminalRowHeight),
    paneId,
    axis,
    1,
  );
  return withWorkspacePaneRects(panes, compactWorkspacePaneRects(pushedRects, paneId, axis));
}

export function resizeWorkspacePaneWidth(
  panes: readonly PersistedWorkspaceDockedPane[],
  paneId: string,
  width: number,
  hostWidth: number,
): PersistedWorkspaceDockedPane[] {
  if (!Number.isFinite(width)) {
    return [...panes];
  }
  return panes.map((pane) => {
    if (pane.paneId !== paneId) {
      return pane;
    }
    const minimumWidth = workspacePaneDefaultWidth(pane, hostWidth);
    const nextWidth = Math.min(MAX_WORKSPACE_PANE_WIDTH, Math.max(minimumWidth, width));
    return Object.assign({}, pane, { size: nextWidth / minimumWidth });
  });
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
