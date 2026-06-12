import type { WorkspacePaneDropDirection } from "~/workspacePaneLayout";

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
