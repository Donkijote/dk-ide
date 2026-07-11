import type {
  PersistedWorkspaceDockedPane,
  WorkspaceDockedPaneType,
  WorkspaceDockedPaneHeightPreset,
  WorkspaceDockedPaneWidthPreset,
  WorkspaceDockedPaneSlot,
} from "./uiStateStore";

export const MIN_WORKSPACE_TERMINAL_ROW_HEIGHT = 280;
export const MIN_WORKSPACE_PANE_HEIGHT = 736;
export const WORKSPACE_PANE_GAP = 12;
export const MAX_WORKSPACE_PANE_STACK_SIZE = 3;

const MAX_WORKSPACE_PANE_WIDTH = 1_400;
const MAX_WORKSPACE_PANE_HEIGHT = 4_000;
const MIN_CUSTOM_WORKSPACE_PANE_WIDTH = 280;
export const WORKSPACE_PANE_WIDTH_PRESETS = ["narrow", "medium", "large", "wide"] as const;
export const WORKSPACE_PANE_HEIGHT_PRESETS = ["half", "top-heavy", "bottom-heavy"] as const;
const WORKSPACE_PANE_WIDTH_PRESET_RATIOS: Record<WorkspaceDockedPaneWidthPreset, number> = {
  narrow: 0.25,
  medium: 0.5,
  large: 0.75,
  wide: 1,
};
const TWO_PANE_HEIGHT_PRESET_RATIOS: Record<
  Extract<WorkspaceDockedPaneHeightPreset, "half" | "top-heavy" | "bottom-heavy">,
  readonly [number, number]
> = {
  half: [0.5, 0.5],
  "top-heavy": [0.75, 0.25],
  "bottom-heavy": [0.25, 0.75],
};

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

export function workspacePaneHeightPreset(
  columnPanes: readonly Pick<PersistedWorkspaceDockedPane, "heightPreset">[],
): WorkspaceDockedPaneHeightPreset {
  if (columnPanes.length <= 1 || columnPanes.length >= 3) {
    return "full";
  }
  const preset = columnPanes.find(
    (pane) => pane.heightPreset && pane.heightPreset !== "full",
  )?.heightPreset;
  return preset === "top-heavy" || preset === "bottom-heavy" || preset === "half" ? preset : "half";
}

export function workspacePaneDefaultWidth(
  pane: Pick<PersistedWorkspaceDockedPane, "paneId"> & {
    readonly type?: WorkspaceDockedPaneType;
    readonly widthPreset?: WorkspaceDockedPaneWidthPreset;
  },
  hostWidth: number,
): number {
  const safeHostWidth = Number.isFinite(hostWidth) && hostWidth > 0 ? hostWidth : 1_280;
  return safeHostWidth * WORKSPACE_PANE_WIDTH_PRESET_RATIOS[workspacePaneWidthPreset(pane)];
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

  const safeHostWidth = Number.isFinite(hostWidth) && hostWidth > 0 ? hostWidth : 1_280;
  const targetWidth = clamp(width, 0, safeHostWidth);
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
  return defaultWidth;
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

function orderedColumnPanes(
  panes: readonly PersistedWorkspaceDockedPane[],
): PersistedWorkspaceDockedPane[] {
  return panes.toSorted((left, right) => {
    const byStackOrder = (left.stackOrder ?? left.order) - (right.stackOrder ?? right.order);
    return byStackOrder !== 0 ? byStackOrder : left.paneId.localeCompare(right.paneId);
  });
}

function normalizeStackId(stackId: string | undefined, fallbackPaneId: string): string {
  return stackId && stackId.length > 0 ? stackId : `stack:${fallbackPaneId}`;
}

function paneColumnId(pane: PersistedWorkspaceDockedPane): string {
  return pane.stackId ?? `pane:${pane.paneId}`;
}

function workspacePaneWithoutStackFields(
  pane: PersistedWorkspaceDockedPane,
): PersistedWorkspaceDockedPane {
  const {
    heightPreset: _heightPreset,
    stackId: _stackId,
    stackOrder: _stackOrder,
    ...paneWithoutStack
  } = pane;
  return paneWithoutStack as PersistedWorkspaceDockedPane;
}

function workspacePaneColumnWidth(
  columnPanes: readonly PersistedWorkspaceDockedPane[],
  hostWidth: number,
): number {
  return Math.max(...columnPanes.map((pane) => workspacePaneWidth(pane, hostWidth)), 0);
}

function workspacePaneHeightRatios(
  columnPanes: readonly PersistedWorkspaceDockedPane[],
): readonly number[] {
  if (columnPanes.length <= 1) {
    return [1];
  }
  if (columnPanes.length === 2) {
    return TWO_PANE_HEIGHT_PRESET_RATIOS[
      workspacePaneHeightPreset(columnPanes) as keyof typeof TWO_PANE_HEIGHT_PRESET_RATIOS
    ];
  }
  return [1 / 3, 1 / 3, 1 / 3];
}

function normalizePaneOrder(
  panes: readonly PersistedWorkspaceDockedPane[],
): PersistedWorkspaceDockedPane[] {
  const columns = workspacePaneColumns(panes);
  let order = 0;
  return columns.flatMap((column) =>
    column.panes.map((pane, stackOrder) => {
      const nextPane = {
        ...pane,
        order: order++,
      };
      if (column.panes.length <= 1) {
        const {
          heightPreset: _heightPreset,
          stackId: _stackId,
          stackOrder: _stackOrder,
          ...nextPaneWithoutStack
        } = nextPane;
        return {
          ...nextPaneWithoutStack,
        };
      }
      const nextStackPane = {
        ...nextPane,
        stackId: normalizeStackId(pane.stackId, column.panes[0]?.paneId ?? pane.paneId),
        stackOrder,
      };
      if (column.panes.length >= 3) {
        return nextStackPane;
      }
      return {
        ...nextStackPane,
        heightPreset: workspacePaneHeightPreset(column.panes),
      };
    }),
  );
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
  const columnById = new Map<
    string,
    { firstOrder: number; panes: PersistedWorkspaceDockedPane[] }
  >();
  for (const pane of orderedWorkspacePanes(panes)) {
    const columnId = paneColumnId(pane);
    const column = columnById.get(columnId);
    if (column) {
      column.firstOrder = Math.min(column.firstOrder, pane.order);
      column.panes.push(pane);
    } else {
      columnById.set(columnId, { firstOrder: pane.order, panes: [pane] });
    }
  }

  return Array.from(columnById.values())
    .toSorted((left, right) => {
      const byOrder = left.firstOrder - right.firstOrder;
      return byOrder !== 0 ? byOrder : left.panes[0]!.paneId.localeCompare(right.panes[0]!.paneId);
    })
    .map((column, index) => ({
      column: index,
      panes: orderedColumnPanes(column.panes).slice(0, MAX_WORKSPACE_PANE_STACK_SIZE),
    }));
}

export function workspacePanePlacements(
  panes: readonly PersistedWorkspaceDockedPane[],
): ReadonlyMap<string, WorkspacePanePlacement> {
  const placements = new Map<string, WorkspacePanePlacement>();
  workspacePaneColumns(normalizePaneOrder(panes)).forEach((column, columnIndex) => {
    column.panes.forEach((pane, row) => {
      placements.set(pane.paneId, { slot: "grid", column: columnIndex, row });
    });
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
  const rects: WorkspacePaneRect[] = [];
  for (const column of workspacePaneColumns(normalizePaneOrder(panes))) {
    const columnHeight = workspacePaneHeight({}, paneHeight);
    const width = workspacePaneColumnWidth(column.panes, hostWidth);
    const ratios = workspacePaneHeightRatios(column.panes);
    const verticalGapTotal = WORKSPACE_PANE_GAP * Math.max(0, column.panes.length - 1);
    const availableHeight = Math.max(1, columnHeight - verticalGapTotal);
    let y = 0;
    column.panes.forEach((pane, row) => {
      const height =
        row === column.panes.length - 1
          ? Math.max(1, columnHeight - y)
          : Math.max(1, Math.round(availableHeight * (ratios[row] ?? 1)));
      rects.push({ pane, x, y, width, height });
      y += height + WORKSPACE_PANE_GAP;
    });
    x += width + WORKSPACE_PANE_GAP;
  }
  return rects;
}

function withWorkspacePaneRects(
  panes: readonly PersistedWorkspaceDockedPane[],
  rects: readonly WorkspacePaneRect[],
): PersistedWorkspaceDockedPane[] {
  const rectByPaneId = new Map(rects.map((rect) => [rect.pane.paneId, rect]));
  const placementByPaneId = workspacePanePlacements(panes);
  return normalizePaneOrder(panes).map((pane, order) => {
    const rect = rectByPaneId.get(pane.paneId);
    const placement = placementByPaneId.get(pane.paneId);
    return {
      ...pane,
      order,
      widthPreset: pane.widthPreset ?? workspacePaneWidthPreset(pane),
      dockSlot: "grid",
      dockColumn: placement?.column ?? order,
      dockRow: placement?.row ?? 0,
      dockX: Math.round(rect?.x ?? 0),
      dockY: Math.round(rect?.y ?? 0),
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
  if (direction === "above" || direction === "below") {
    const overPane = reordered[targetIndex];
    if (!overPane) {
      return orderedPanes;
    }
    const targetColumn = workspacePaneColumns(reordered).find((column) =>
      column.panes.some((pane) => pane.paneId === overPaneId),
    );
    if (!targetColumn || targetColumn.panes.length >= MAX_WORKSPACE_PANE_STACK_SIZE) {
      reordered.splice(
        targetIndex + (direction === "below" ? 1 : 0),
        0,
        workspacePaneWithoutStackFields(activePane),
      );
      return normalizePaneOrder(reordered);
    }
    const stackId = normalizeStackId(overPane.stackId, targetColumn.panes[0]?.paneId ?? overPaneId);
    const stackPanes = orderedColumnPanes([
      ...targetColumn.panes.map((pane) => ({ ...pane, stackId })),
      { ...activePane, stackId },
    ]);
    const overStackIndex = stackPanes.findIndex((pane) => pane.paneId === overPaneId);
    const activeStackIndex = stackPanes.findIndex((pane) => pane.paneId === activePaneId);
    if (overStackIndex < 0 || activeStackIndex < 0) {
      return orderedPanes;
    }
    const [stackedActivePane] = stackPanes.splice(activeStackIndex, 1);
    if (!stackedActivePane) {
      return orderedPanes;
    }
    const nextOverStackIndex =
      activeStackIndex < overStackIndex ? overStackIndex - 1 : overStackIndex;
    stackPanes.splice(nextOverStackIndex + (direction === "below" ? 1 : 0), 0, stackedActivePane);
    const stackPaneById = new Map(
      stackPanes.map((pane, stackOrder) => {
        const stackPane = { ...pane, stackId, stackOrder };
        const { heightPreset: _heightPreset, ...stackPaneWithoutHeightPreset } = stackPane;
        return [
          pane.paneId,
          stackPanes.length === 2
            ? { ...stackPane, heightPreset: workspacePaneHeightPreset(stackPanes) }
            : stackPaneWithoutHeightPreset,
        ] as const;
      }),
    );
    const nextPanes = reordered.map((pane) => {
      const stackPane = stackPaneById.get(pane.paneId);
      return stackPane ?? pane;
    });
    const retainedPaneIds = new Set(nextPanes.map((pane) => pane.paneId));
    for (const stackPane of stackPaneById.values()) {
      if (!retainedPaneIds.has(stackPane.paneId)) {
        nextPanes.push(stackPane);
      }
    }
    return normalizePaneOrder(nextPanes);
  }

  const shouldInsertAfter = direction === "after";
  reordered.splice(
    targetIndex + (shouldInsertAfter ? 1 : 0),
    0,
    workspacePaneWithoutStackFields(activePane),
  );
  return normalizePaneOrder(reordered);
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
  const targetPane = panes.find((candidate) => candidate.paneId === paneId);
  return normalizePaneOrder(panes).map((pane) => {
    if (pane.paneId !== paneId && (!targetPane?.stackId || pane.stackId !== targetPane.stackId)) {
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
  const targetPane = orderedPanes.find((pane) => pane.paneId === paneId);
  if (!targetPane) {
    return orderedPanes;
  }

  return orderedPanes.map((pane) => {
    if (pane.paneId !== paneId && (!targetPane.stackId || pane.stackId !== targetPane.stackId)) {
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
  const targetPane = orderedPanes.find((pane) => pane.paneId === paneId);
  if (!targetPane) {
    return orderedPanes;
  }
  return orderedPanes.map((pane) => {
    if (pane.paneId !== paneId && (!targetPane.stackId || pane.stackId !== targetPane.stackId)) {
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

export function setWorkspacePaneHeightPreset(
  panes: readonly PersistedWorkspaceDockedPane[],
  paneId: string,
  heightPreset: WorkspaceDockedPaneHeightPreset,
): PersistedWorkspaceDockedPane[] {
  const orderedPanes = normalizePaneOrder(panes);
  const targetPane = orderedPanes.find((pane) => pane.paneId === paneId);
  if (
    !targetPane?.stackId ||
    !WORKSPACE_PANE_HEIGHT_PRESETS.includes(
      heightPreset as (typeof WORKSPACE_PANE_HEIGHT_PRESETS)[number],
    )
  ) {
    return orderedPanes;
  }
  const stackPaneCount = orderedPanes.filter((pane) => pane.stackId === targetPane.stackId).length;
  if (stackPaneCount !== 2) {
    return orderedPanes;
  }
  return orderedPanes.map((pane) =>
    pane.stackId === targetPane.stackId ? { ...pane, heightPreset } : pane,
  );
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
