import { MIN_WORKSPACE_PANE_HEIGHT, type WorkspacePaneDropDirection } from "~/workspacePaneLayout";
import type { PersistedWorkspaceDockedPane } from "~/uiStateStore";

interface WorkspacePanePoint {
  readonly x: number;
  readonly y: number;
}

interface WorkspacePaneBounds {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

interface WorkspacePaneDropDirectionInput {
  readonly activeRect: WorkspacePaneBounds | null;
  readonly overRect: WorkspacePaneBounds;
  readonly pointer: WorkspacePanePoint | null;
}

export function workspacePaneDropDirection({
  activeRect,
  overRect,
  pointer,
}: WorkspacePaneDropDirectionInput): WorkspacePaneDropDirection {
  const dropPoint = pointer ?? {
    x: (activeRect?.left ?? overRect.left) + (activeRect?.width ?? overRect.width) / 2,
    y: (activeRect?.top ?? overRect.top) + (activeRect?.height ?? overRect.height) / 2,
  };
  const horizontalOffset =
    (dropPoint.x - (overRect.left + overRect.width / 2)) / Math.max(overRect.width, 1);
  const verticalOffset =
    (dropPoint.y - (overRect.top + overRect.height / 2)) / Math.max(overRect.height, 1);

  if (Math.abs(horizontalOffset) <= 0.25 && Math.abs(verticalOffset) <= 0.25) {
    return "swap";
  }
  if (Math.abs(verticalOffset) > Math.abs(horizontalOffset)) {
    return verticalOffset < 0 ? "above" : "below";
  }
  return horizontalOffset < 0 ? "before" : "after";
}

export type WorkspacePaneFocusNavigation = "previous" | "next" | "first" | "last";

function orderedWorkspacePaneIds(panes: readonly PersistedWorkspaceDockedPane[]): string[] {
  return panes
    .toSorted((left, right) => {
      const byOrder = left.order - right.order;
      return byOrder !== 0 ? byOrder : left.paneId.localeCompare(right.paneId);
    })
    .map((pane) => pane.paneId);
}

export function workspacePaneKeyboardFocusTarget(
  panes: readonly PersistedWorkspaceDockedPane[],
  activePaneId: string | null | undefined,
  navigation: WorkspacePaneFocusNavigation,
): string | null {
  const paneIds = orderedWorkspacePaneIds(panes);
  if (paneIds.length === 0) {
    return null;
  }

  if (navigation === "first") {
    return paneIds[0] ?? null;
  }
  if (navigation === "last") {
    return paneIds.at(-1) ?? null;
  }

  const activeIndex = activePaneId ? paneIds.indexOf(activePaneId) : -1;
  const fallbackIndex = navigation === "next" ? 0 : paneIds.length - 1;
  if (activeIndex < 0) {
    return paneIds[fallbackIndex] ?? null;
  }

  const nextIndex =
    navigation === "next"
      ? Math.min(activeIndex + 1, paneIds.length - 1)
      : Math.max(activeIndex - 1, 0);
  return paneIds[nextIndex] ?? null;
}

interface WorkspacePaneScrollTargetInput {
  readonly paneLeft: number;
  readonly paneWidth: number;
  readonly viewportLeft: number;
  readonly viewportWidth: number;
}

export function workspacePaneScrollTarget({
  paneLeft,
  paneWidth,
  viewportLeft,
  viewportWidth,
}: WorkspacePaneScrollTargetInput): number | null {
  const viewportRight = viewportLeft + viewportWidth;
  const paneRight = paneLeft + paneWidth;
  if (paneLeft >= viewportLeft && paneRight <= viewportRight) {
    return null;
  }
  if (paneWidth >= viewportWidth) {
    return Math.max(0, paneLeft);
  }
  const centeredLeft = paneLeft - (viewportWidth - paneWidth) / 2;
  return Math.max(0, centeredLeft);
}

export function workspacePaneHostLayoutSize(input: {
  readonly clientWidth: number;
  readonly clientHeight: number;
  readonly horizontalInset?: number;
}): { readonly width: number; readonly height: number } {
  const horizontalInset =
    typeof input.horizontalInset === "number" && Number.isFinite(input.horizontalInset)
      ? input.horizontalInset
      : 0;
  return {
    width: Math.max(1, Math.round(input.clientWidth - horizontalInset)),
    height: Math.max(MIN_WORKSPACE_PANE_HEIGHT, Math.round(input.clientHeight - 32)),
  };
}
