import type { PersistedWorkspaceDockedPane, WorkspaceDockedPaneType } from "./uiStateStore";

export const MIN_WORKSPACE_PANE_WIDTH = 320;

const MAX_WORKSPACE_PANE_WIDTH = 1_400;
const EDITOR_DEFAULT_WIDTH_RATIO = 0.56;
const SUPPORTING_PANE_DEFAULT_WIDTH_RATIO = 0.44;
const EDITOR_MIN_DEFAULT_WIDTH = 512;
const SUPPORTING_PANE_MIN_DEFAULT_WIDTH = 384;

export function workspacePaneDefaultWidth(
  type: WorkspaceDockedPaneType,
  hostWidth: number,
): number {
  const safeHostWidth = Number.isFinite(hostWidth) && hostWidth > 0 ? hostWidth : 1_280;
  return type === "editor"
    ? Math.max(EDITOR_MIN_DEFAULT_WIDTH, safeHostWidth * EDITOR_DEFAULT_WIDTH_RATIO)
    : Math.max(
        SUPPORTING_PANE_MIN_DEFAULT_WIDTH,
        safeHostWidth * SUPPORTING_PANE_DEFAULT_WIDTH_RATIO,
      );
}

export function workspacePaneWidth(
  pane: Pick<PersistedWorkspaceDockedPane, "size" | "type">,
  hostWidth: number,
): number {
  return Math.min(
    MAX_WORKSPACE_PANE_WIDTH,
    Math.max(MIN_WORKSPACE_PANE_WIDTH, workspacePaneDefaultWidth(pane.type, hostWidth) * pane.size),
  );
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
  const clampedDelta = Math.min(
    Math.max(delta, MIN_WORKSPACE_PANE_WIDTH - leadingWidth),
    trailingWidth - MIN_WORKSPACE_PANE_WIDTH,
  );
  if (clampedDelta === 0) {
    return [...panes];
  }

  const nextLeadingSize =
    (leadingWidth + clampedDelta) / workspacePaneDefaultWidth(leadingPane.type, hostWidth);
  const nextTrailingSize =
    (trailingWidth - clampedDelta) / workspacePaneDefaultWidth(trailingPane.type, hostWidth);

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
