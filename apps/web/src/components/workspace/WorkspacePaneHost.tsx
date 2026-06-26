import {
  DndContext,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  createContext,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { PersistedWorkspaceDockedPane } from "~/uiStateStore";
import {
  MIN_WORKSPACE_PANE_HEIGHT,
  normalizeWorkspacePaneLayout,
  placeWorkspacePane,
  pushWorkspacePaneCollisions,
  resizeWorkspacePaneHeight,
  resizeWorkspacePaneWidth,
  workspacePaneHeight,
  workspacePaneRects,
  workspacePaneWidth,
  workspaceTerminalRowHeight,
} from "~/workspacePaneLayout";
import { cn } from "~/lib/utils";
import { workspacePaneDropDirection } from "./WorkspacePaneHost.logic";

const WORKSPACE_PANE_MEASURING = {
  droppable: {
    strategy: MeasuringStrategy.WhileDragging,
  },
} as const;
const WORKSPACE_PANE_RESIZE_OBSERVER = { disabled: true } as const;
const WORKSPACE_PANE_COLLISION_DETECTION: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
};

function disableWorkspacePaneLayoutAnimation(): false {
  return false;
}

function useStableWorkspacePaneIds(panes: readonly PersistedWorkspaceDockedPane[]): string[] {
  const paneIdsRef = useRef<string[]>([]);
  const paneIds = paneIdsRef.current;
  if (
    paneIds.length !== panes.length ||
    panes.some((pane, index) => pane.paneId !== paneIds[index])
  ) {
    paneIdsRef.current = panes.map((pane) => pane.paneId);
  }
  return paneIdsRef.current;
}

interface WorkspacePaneDragHandleValue {
  readonly attributes: ReturnType<typeof useSortable>["attributes"];
  readonly listeners: ReturnType<typeof useSortable>["listeners"];
  readonly setActivatorNodeRef: ReturnType<typeof useSortable>["setActivatorNodeRef"];
}

const WorkspacePaneDragHandleContext = createContext<WorkspacePaneDragHandleValue | null>(null);

export function useWorkspacePaneDragHandle(): WorkspacePaneDragHandleValue | null {
  return useContext(WorkspacePaneDragHandleContext);
}

interface WorkspacePaneContainerProps {
  readonly pane: PersistedWorkspaceDockedPane;
  readonly children: ReactNode;
}

function SortableWorkspacePane({ children, pane }: WorkspacePaneContainerProps) {
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform } =
    useSortable({
      id: pane.paneId,
      animateLayoutChanges: disableWorkspacePaneLayoutAnimation,
      resizeObserverConfig: WORKSPACE_PANE_RESIZE_OBSERVER,
      transition: null,
    });
  const dragHandle = useMemo(
    () => ({ attributes, listeners, setActivatorNodeRef }),
    [attributes, listeners, setActivatorNodeRef],
  );

  return (
    <WorkspacePaneDragHandleContext.Provider value={dragHandle}>
      <div
        ref={setNodeRef}
        className={cn("flex h-full shrink-0 flex-col", isDragging && "z-20 opacity-70")}
        data-workspace-pane-id={pane.paneId}
        style={{
          width: "100%",
          transform: CSS.Transform.toString(transform),
        }}
      >
        {children}
      </div>
    </WorkspacePaneDragHandleContext.Provider>
  );
}

interface WorkspacePaneHostProps {
  readonly panes: readonly PersistedWorkspaceDockedPane[];
  readonly renderPane: (pane: PersistedWorkspaceDockedPane) => ReactNode;
  readonly terminalRowHeight: number;
  readonly onPanesChange: (panes: readonly PersistedWorkspaceDockedPane[]) => void;
}

export function WorkspacePaneHost({
  onPanesChange,
  panes,
  renderPane,
  terminalRowHeight,
}: WorkspacePaneHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const horizontalResizeStateRef = useRef<{
    pointerId: number;
    paneId: string;
    startWidth: number;
    startX: number;
    panes: readonly PersistedWorkspaceDockedPane[];
  } | null>(null);
  const verticalResizeStateRef = useRef<{
    defaultHeight: number;
    pointerId: number;
    paneId: string;
    startHeight: number;
    startY: number;
    panes: readonly PersistedWorkspaceDockedPane[];
  } | null>(null);
  const dragStartPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [layoutWidth, setLayoutWidth] = useState(1_280);
  const [layoutHeight, setLayoutHeight] = useState(MIN_WORKSPACE_PANE_HEIGHT);
  const [previewPanes, setPreviewPanes] = useState<readonly PersistedWorkspaceDockedPane[] | null>(
    null,
  );
  const renderedPanes = previewPanes ?? panes;
  const renderedTerminalRowHeight = workspaceTerminalRowHeight(terminalRowHeight);
  const normalizedRenderedPanes = useMemo(
    () =>
      normalizeWorkspacePaneLayout(
        renderedPanes,
        layoutWidth,
        layoutHeight,
        renderedTerminalRowHeight,
      ),
    [layoutHeight, layoutWidth, renderedPanes, renderedTerminalRowHeight],
  );
  const paneIds = useStableWorkspacePaneIds(normalizedRenderedPanes);
  const paneRects = useMemo(
    () =>
      workspacePaneRects(
        normalizedRenderedPanes,
        layoutWidth,
        layoutHeight,
        renderedTerminalRowHeight,
      ),
    [layoutHeight, layoutWidth, normalizedRenderedPanes, renderedTerminalRowHeight],
  );
  const contentWidth = Math.max(...paneRects.map((rect) => rect.x + rect.width), 0);
  const contentHeight = Math.max(...paneRects.map((rect) => rect.y + rect.height), 0);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    if (host.clientWidth > 0) {
      setLayoutWidth(host.clientWidth);
    }
    setLayoutHeight(Math.max(MIN_WORKSPACE_PANE_HEIGHT, host.clientHeight - 32));
  }, []);

  useEffect(() => {
    if (previewPanes !== null) {
      return;
    }
    const needsRepair = panes.some((pane, index) => {
      const normalizedPane = normalizedRenderedPanes[index];
      return (
        !normalizedPane ||
        pane.paneId !== normalizedPane.paneId ||
        pane.dockX !== normalizedPane.dockX ||
        pane.dockY !== normalizedPane.dockY
      );
    });
    if (needsRepair) {
      onPanesChange(normalizedRenderedPanes);
    }
  }, [normalizedRenderedPanes, onPanesChange, panes, previewPanes]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const startPointer = dragStartPointerRef.current;
      dragStartPointerRef.current = null;
      if (!over || active.id === over.id) {
        return;
      }
      onPanesChange(
        placeWorkspacePane(
          panes,
          String(active.id),
          String(over.id),
          workspacePaneDropDirection({
            activeRect: active.rect.current.translated,
            overRect: over.rect,
            pointer: startPointer
              ? {
                  x: startPointer.x + event.delta.x,
                  y: startPointer.y + event.delta.y,
                }
              : null,
          }),
          layoutWidth,
          layoutHeight,
          renderedTerminalRowHeight,
        ),
      );
    },
    [layoutHeight, layoutWidth, onPanesChange, panes, renderedTerminalRowHeight],
  );
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const activatorEvent = event.activatorEvent;
    dragStartPointerRef.current =
      "clientX" in activatorEvent &&
      "clientY" in activatorEvent &&
      typeof activatorEvent.clientX === "number" &&
      typeof activatorEvent.clientY === "number"
        ? { x: activatorEvent.clientX, y: activatorEvent.clientY }
        : null;
  }, []);

  const resizePaneWidth = useCallback(
    (
      sourcePanes: readonly PersistedWorkspaceDockedPane[],
      paneId: string,
      width: number,
    ): PersistedWorkspaceDockedPane[] => {
      const resized = resizeWorkspacePaneWidth(sourcePanes, paneId, width, layoutWidth);
      return pushWorkspacePaneCollisions(
        resized,
        paneId,
        "horizontal",
        layoutWidth,
        layoutHeight,
        renderedTerminalRowHeight,
      );
    },
    [layoutHeight, layoutWidth, renderedTerminalRowHeight],
  );

  const handleHorizontalResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, pane: PersistedWorkspaceDockedPane) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      horizontalResizeStateRef.current = {
        pointerId: event.pointerId,
        paneId: pane.paneId,
        startWidth: workspacePaneWidth(pane, layoutWidth),
        startX: event.clientX,
        panes,
      };
      setPreviewPanes(panes);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [layoutWidth, panes],
  );

  const handleHorizontalResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = horizontalResizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }
      setPreviewPanes(
        resizePaneWidth(
          resizeState.panes,
          resizeState.paneId,
          resizeState.startWidth + event.clientX - resizeState.startX,
        ),
      );
    },
    [resizePaneWidth],
  );

  const finishHorizontalResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = horizontalResizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const nextPanes = resizePaneWidth(
        resizeState.panes,
        resizeState.paneId,
        resizeState.startWidth + event.clientX - resizeState.startX,
      );
      horizontalResizeStateRef.current = null;
      setPreviewPanes(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onPanesChange(nextPanes);
    },
    [onPanesChange, resizePaneWidth],
  );

  const resizePaneHeight = useCallback(
    (
      sourcePanes: readonly PersistedWorkspaceDockedPane[],
      paneId: string,
      height: number,
      defaultHeight: number,
    ): PersistedWorkspaceDockedPane[] =>
      pushWorkspacePaneCollisions(
        resizeWorkspacePaneHeight(sourcePanes, paneId, height, defaultHeight),
        paneId,
        "vertical",
        layoutWidth,
        layoutHeight,
        renderedTerminalRowHeight,
      ),
    [layoutHeight, layoutWidth, renderedTerminalRowHeight],
  );

  const handleVerticalResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, pane: PersistedWorkspaceDockedPane) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const defaultHeight = pane.type === "terminal" ? renderedTerminalRowHeight : layoutHeight;
      verticalResizeStateRef.current = {
        defaultHeight,
        pointerId: event.pointerId,
        paneId: pane.paneId,
        startHeight: workspacePaneHeight(pane, defaultHeight),
        startY: event.clientY,
        panes,
      };
      setPreviewPanes(panes);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    [layoutHeight, panes, renderedTerminalRowHeight],
  );

  const handleVerticalResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = verticalResizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }
      setPreviewPanes(
        resizePaneHeight(
          resizeState.panes,
          resizeState.paneId,
          resizeState.startHeight + event.clientY - resizeState.startY,
          resizeState.defaultHeight,
        ),
      );
    },
    [resizePaneHeight],
  );

  const finishVerticalResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = verticalResizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const nextPanes = resizePaneHeight(
        resizeState.panes,
        resizeState.paneId,
        resizeState.startHeight + event.clientY - resizeState.startY,
        resizeState.defaultHeight,
      );
      verticalResizeStateRef.current = null;
      setPreviewPanes(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onPanesChange(nextPanes);
    },
    [onPanesChange, resizePaneHeight],
  );

  useEffect(
    () => () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    },
    [],
  );

  return (
    <div
      ref={hostRef}
      className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="workspace-pane-host"
    >
      <DndContext
        collisionDetection={WORKSPACE_PANE_COLLISION_DETECTION}
        measuring={WORKSPACE_PANE_MEASURING}
        sensors={sensors}
        onDragCancel={() => {
          dragStartPointerRef.current = null;
        }}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
      >
        <SortableContext items={paneIds} strategy={rectSortingStrategy}>
          <div className="w-max p-3 sm:p-4">
            <div
              className="relative"
              style={{ width: `${contentWidth}px`, height: `${contentHeight}px` }}
            >
              {paneRects.map(({ height, pane, width, x, y }) => (
                <div
                  key={pane.paneId}
                  className="absolute"
                  style={{
                    left: `${x}px`,
                    top: `${y}px`,
                    width: `${width}px`,
                    height: `${height}px`,
                  }}
                >
                  <SortableWorkspacePane pane={pane}>{renderPane(pane)}</SortableWorkspacePane>
                  <HorizontalResizeHandle
                    label={`Resize ${pane.title} pane`}
                    onPointerDown={(event) => handleHorizontalResizePointerDown(event, pane)}
                    onPointerMove={handleHorizontalResizePointerMove}
                    onPointerUp={finishHorizontalResize}
                  />
                  <VerticalResizeHandle
                    label={`Resize ${pane.title} pane`}
                    onPointerDown={(event) => handleVerticalResizePointerDown(event, pane)}
                    onPointerMove={handleVerticalResizePointerMove}
                    onPointerUp={finishVerticalResize}
                  />
                </div>
              ))}
            </div>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface ResizeHandleProps {
  readonly label: string;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

function HorizontalResizeHandle({
  label,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      className="absolute -right-3 top-0 z-30 h-full w-3 cursor-col-resize touch-none"
      data-workspace-resize-handle="horizontal"
      onPointerCancel={onPointerUp}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        className="mx-auto h-full w-px bg-border/60 transition-colors hover:bg-ring/70"
        data-workspace-resize-divider="horizontal"
      />
    </div>
  );
}

function VerticalResizeHandle({
  label,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="horizontal"
      className="absolute -bottom-3 left-0 z-30 flex h-3 w-full cursor-row-resize items-center touch-none"
      data-workspace-resize-handle="vertical"
      onPointerCancel={onPointerUp}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        className="h-px w-full bg-border/60 transition-colors hover:bg-ring/70"
        data-workspace-resize-divider="vertical"
      />
    </div>
  );
}
