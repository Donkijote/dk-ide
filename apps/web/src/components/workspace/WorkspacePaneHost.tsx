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
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  createContext,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
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
  resizeWorkspacePaneWidth,
  workspacePaneRects,
  workspacePaneWidth,
  workspaceTerminalRowHeight,
} from "~/workspacePaneLayout";
import { cn } from "~/lib/utils";
import {
  workspacePaneDropDirection,
  workspacePaneHostLayoutSize,
  workspacePaneKeyboardFocusTarget,
  workspacePaneScrollTarget,
} from "./WorkspacePaneHost.logic";

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
const WORKSPACE_PANE_NAVIGATION_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

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
const WorkspacePaneContentContext = createContext(false);

export function useWorkspacePaneDragHandle(): WorkspacePaneDragHandleValue | null {
  return useContext(WorkspacePaneDragHandleContext);
}

export function useIsInsideWorkspacePane(): boolean {
  return useContext(WorkspacePaneContentContext);
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
      <WorkspacePaneContentContext.Provider value>
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
      </WorkspacePaneContentContext.Provider>
    </WorkspacePaneDragHandleContext.Provider>
  );
}

interface WorkspacePaneHostProps {
  readonly panes: readonly PersistedWorkspaceDockedPane[];
  readonly renderPane: (pane: PersistedWorkspaceDockedPane) => ReactNode;
  readonly terminalRowHeight: number;
  readonly activePaneId?: string | null;
  readonly scrollLeft?: number | null;
  readonly onActivePaneChange?: (paneId: string) => void;
  readonly onPanesChange: (panes: readonly PersistedWorkspaceDockedPane[]) => void;
  readonly onScrollLeftChange?: (scrollLeft: number) => void;
}

export function WorkspacePaneHost({
  activePaneId,
  onPanesChange,
  onActivePaneChange,
  onScrollLeftChange,
  panes,
  renderPane,
  scrollLeft,
  terminalRowHeight,
}: WorkspacePaneHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stripPaddingRef = useRef<HTMLDivElement>(null);
  const horizontalResizeStateRef = useRef<{
    pointerId: number;
    paneId: string;
    startWidth: number;
    startX: number;
    panes: readonly PersistedWorkspaceDockedPane[];
  } | null>(null);
  const dragStartPointerRef = useRef<{ x: number; y: number } | null>(null);
  const didRestoreScrollRef = useRef(false);
  const lastReportedScrollLeftRef = useRef<number | null>(null);
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
  const contentHeight = Math.max(layoutHeight, ...paneRects.map((rect) => rect.y + rect.height), 0);
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

    const updateLayoutSize = () => {
      const stripPadding = stripPaddingRef.current;
      const stripPaddingStyle =
        stripPadding && typeof window !== "undefined"
          ? window.getComputedStyle(stripPadding)
          : null;
      const horizontalInset =
        (Number.parseFloat(stripPaddingStyle?.paddingLeft ?? "0") || 0) +
        (Number.parseFloat(stripPaddingStyle?.paddingRight ?? "0") || 0);
      const nextSize = workspacePaneHostLayoutSize({
        clientWidth: host.clientWidth,
        clientHeight: host.clientHeight,
        horizontalInset,
      });
      setLayoutWidth((currentWidth) => {
        return currentWidth === nextSize.width ? currentWidth : nextSize.width;
      });
      setLayoutHeight((currentHeight) => {
        return currentHeight === nextSize.height ? currentHeight : nextSize.height;
      });
    };

    updateLayoutSize();
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(updateLayoutSize);
    resizeObserver.observe(host);
    return () => resizeObserver.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (previewPanes !== null) {
      return;
    }
    const needsRepair = panes.some((pane, index) => {
      const normalizedPane = normalizedRenderedPanes[index];
      return (
        !normalizedPane ||
        pane.paneId !== normalizedPane.paneId ||
        pane.order !== normalizedPane.order ||
        pane.widthPreset !== normalizedPane.widthPreset ||
        pane.heightPreset !== normalizedPane.heightPreset ||
        pane.stackId !== normalizedPane.stackId ||
        pane.stackOrder !== normalizedPane.stackOrder ||
        pane.dockColumn !== normalizedPane.dockColumn ||
        pane.dockRow !== normalizedPane.dockRow ||
        pane.dockX !== normalizedPane.dockX ||
        pane.dockY !== normalizedPane.dockY
      );
    });
    if (needsRepair) {
      onPanesChange(normalizedRenderedPanes);
    }
  }, [normalizedRenderedPanes, onPanesChange, panes, previewPanes]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || didRestoreScrollRef.current) {
      return;
    }
    host.scrollLeft = Math.max(0, scrollLeft ?? 0);
    didRestoreScrollRef.current = true;
  }, [scrollLeft]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !activePaneId) {
      return;
    }
    const activeRect = paneRects.find((rect) => rect.pane.paneId === activePaneId);
    if (!activeRect) {
      return;
    }

    const nextScrollLeft = workspacePaneScrollTarget({
      paneLeft: activeRect.x,
      paneWidth: activeRect.width,
      viewportLeft: host.scrollLeft,
      viewportWidth: host.clientWidth,
    });
    if (nextScrollLeft === null) {
      return;
    }

    host.scrollTo({ left: nextScrollLeft, behavior: "smooth" });
  }, [activePaneId, paneRects]);

  const handleHostKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (
        event.target !== event.currentTarget ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !WORKSPACE_PANE_NAVIGATION_KEYS.has(event.key)
      ) {
        return;
      }

      const navigation =
        event.key === "ArrowLeft"
          ? "previous"
          : event.key === "ArrowRight"
            ? "next"
            : event.key === "ArrowUp"
              ? "up"
              : event.key === "ArrowDown"
                ? "down"
                : event.key === "Home"
                  ? "first"
                  : "last";
      const nextActivePaneId = workspacePaneKeyboardFocusTarget(
        normalizedRenderedPanes,
        activePaneId,
        navigation,
      );
      if (!nextActivePaneId || nextActivePaneId === activePaneId) {
        return;
      }

      event.preventDefault();
      onActivePaneChange?.(nextActivePaneId);
    },
    [activePaneId, normalizedRenderedPanes, onActivePaneChange],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const startPointer = dragStartPointerRef.current;
      dragStartPointerRef.current = null;
      if (!over || active.id === over.id) {
        return;
      }
      const nextActivePaneId = String(active.id);
      onPanesChange(
        placeWorkspacePane(
          panes,
          nextActivePaneId,
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
      onActivePaneChange?.(nextActivePaneId);
    },
    [
      layoutHeight,
      layoutWidth,
      onActivePaneChange,
      onPanesChange,
      panes,
      renderedTerminalRowHeight,
    ],
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
      return normalizeWorkspacePaneLayout(
        resizeWorkspacePaneWidth(sourcePanes, paneId, width, layoutWidth),
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
      onActivePaneChange?.(resizeState.paneId);
    },
    [onActivePaneChange, onPanesChange, resizePaneWidth],
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
      className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain outline-none focus:outline-none focus-visible:outline-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="region"
      tabIndex={0}
      aria-label="Workspace pane strip"
      data-testid="workspace-pane-host"
      onKeyDown={handleHostKeyDown}
      onScroll={(event) => {
        const nextScrollLeft = Math.round(event.currentTarget.scrollLeft);
        if (lastReportedScrollLeftRef.current === nextScrollLeft) {
          return;
        }
        lastReportedScrollLeftRef.current = nextScrollLeft;
        onScrollLeftChange?.(nextScrollLeft);
      }}
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
        <SortableContext items={paneIds} strategy={horizontalListSortingStrategy}>
          <div ref={stripPaddingRef} className="w-max p-3 sm:p-4">
            <div
              className="relative"
              style={{ width: `${contentWidth}px`, height: `${contentHeight}px` }}
            >
              {paneRects.map(({ height, pane, width, x, y }) => (
                <div
                  key={pane.paneId}
                  className={cn(
                    "absolute rounded-[1.75rem] transition-shadow",
                    activePaneId === pane.paneId && "ring-2 ring-ring/70 shadow-lg",
                  )}
                  data-workspace-pane-active={activePaneId === pane.paneId ? "true" : undefined}
                  style={{
                    left: `${x}px`,
                    top: `${y}px`,
                    width: `${width}px`,
                    height: `${height}px`,
                  }}
                  onPointerDown={() => onActivePaneChange?.(pane.paneId)}
                >
                  <SortableWorkspacePane pane={pane}>{renderPane(pane)}</SortableWorkspacePane>
                  <HorizontalResizeHandle
                    label={`Adjust ${pane.title} pane width preset`}
                    onPointerDown={(event) => handleHorizontalResizePointerDown(event, pane)}
                    onPointerMove={handleHorizontalResizePointerMove}
                    onPointerUp={finishHorizontalResize}
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
      <div className="mx-auto h-full w-px opacity-0" data-workspace-resize-divider="horizontal" />
    </div>
  );
}
