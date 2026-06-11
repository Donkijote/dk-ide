import {
  DndContext,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
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
  placeWorkspacePane,
  resizeAdjacentWorkspacePanes,
  resizeWorkspacePaneHeight,
  type WorkspacePaneDropDirection,
  workspacePaneColumns,
  workspacePaneHeight,
  workspacePaneWidth,
  workspaceTerminalRowHeight,
} from "~/workspacePaneLayout";
import { cn } from "~/lib/utils";

const WORKSPACE_PANE_MEASURING = {
  droppable: {
    strategy: MeasuringStrategy.WhileDragging,
  },
} as const;
const WORKSPACE_PANE_RESIZE_OBSERVER = { disabled: true } as const;

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
  readonly hostWidth: number;
  readonly pane: PersistedWorkspaceDockedPane;
  readonly children: ReactNode;
}

function SortableWorkspacePane({ children, hostWidth, pane }: WorkspacePaneContainerProps) {
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
          width: `${workspacePaneWidth(pane, hostWidth)}px`,
          transform: CSS.Transform.toString(transform),
        }}
      >
        {children}
      </div>
    </WorkspacePaneDragHandleContext.Provider>
  );
}

function workspacePaneDropDirection({
  active,
  over,
}: Pick<DragEndEvent, "active" | "over">): WorkspacePaneDropDirection {
  const activeRect = active.rect.current.translated;
  if (!activeRect || !over) {
    return "after";
  }
  const horizontalOffset =
    (activeRect.left + activeRect.width / 2 - (over.rect.left + over.rect.width / 2)) /
    Math.max(over.rect.width, 1);
  const verticalOffset =
    (activeRect.top + activeRect.height / 2 - (over.rect.top + over.rect.height / 2)) /
    Math.max(over.rect.height, 1);
  if (Math.abs(horizontalOffset) <= 0.25 && Math.abs(verticalOffset) <= 0.25) {
    return "swap";
  }
  if (Math.abs(verticalOffset) > Math.abs(horizontalOffset)) {
    return verticalOffset < 0 ? "above" : "below";
  }
  return horizontalOffset < 0 ? "before" : "after";
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
    leadingPaneId: string;
    trailingPaneId: string;
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
  const [layoutWidth, setLayoutWidth] = useState(1_280);
  const [layoutHeight, setLayoutHeight] = useState(MIN_WORKSPACE_PANE_HEIGHT);
  const [previewPanes, setPreviewPanes] = useState<readonly PersistedWorkspaceDockedPane[] | null>(
    null,
  );
  const renderedPanes = previewPanes ?? panes;
  const renderedTerminalRowHeight = workspaceTerminalRowHeight(terminalRowHeight);
  const paneIds = useStableWorkspacePaneIds(renderedPanes);
  const columns = useMemo(() => workspacePaneColumns(renderedPanes), [renderedPanes]);
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

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }
      onPanesChange(
        placeWorkspacePane(
          panes,
          String(active.id),
          String(over.id),
          workspacePaneDropDirection(event),
        ),
      );
    },
    [onPanesChange, panes],
  );

  const resizePanePair = useCallback(
    (
      sourcePanes: readonly PersistedWorkspaceDockedPane[],
      leadingPaneId: string,
      trailingPaneId: string,
      delta: number,
    ): PersistedWorkspaceDockedPane[] => {
      const leadingPane = sourcePanes.find((pane) => pane.paneId === leadingPaneId);
      const trailingPane = sourcePanes.find((pane) => pane.paneId === trailingPaneId);
      if (!leadingPane || !trailingPane) {
        return [...sourcePanes];
      }
      const resizedPair = resizeAdjacentWorkspacePanes(
        [leadingPane, trailingPane],
        leadingPaneId,
        delta,
        layoutWidth,
      );
      const resizedById = new Map(resizedPair.map((pane) => [pane.paneId, pane]));
      return sourcePanes.map((pane) => resizedById.get(pane.paneId) ?? pane);
    },
    [layoutWidth],
  );

  const handleHorizontalResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, leadingPaneId: string, trailingPaneId: string) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      horizontalResizeStateRef.current = {
        pointerId: event.pointerId,
        leadingPaneId,
        trailingPaneId,
        startX: event.clientX,
        panes,
      };
      setPreviewPanes(panes);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [panes],
  );

  const handleHorizontalResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = horizontalResizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }
      setPreviewPanes(
        resizePanePair(
          resizeState.panes,
          resizeState.leadingPaneId,
          resizeState.trailingPaneId,
          event.clientX - resizeState.startX,
        ),
      );
    },
    [resizePanePair],
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
      const nextPanes = resizePanePair(
        resizeState.panes,
        resizeState.leadingPaneId,
        resizeState.trailingPaneId,
        event.clientX - resizeState.startX,
      );
      horizontalResizeStateRef.current = null;
      setPreviewPanes(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onPanesChange(nextPanes);
    },
    [onPanesChange, resizePanePair],
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
        resizeWorkspacePaneHeight(
          resizeState.panes,
          resizeState.paneId,
          resizeState.startHeight + event.clientY - resizeState.startY,
          resizeState.defaultHeight,
        ),
      );
    },
    [],
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
      const nextPanes = resizeWorkspacePaneHeight(
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
    [onPanesChange],
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
        collisionDetection={closestCenter}
        measuring={WORKSPACE_PANE_MEASURING}
        sensors={sensors}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={paneIds} strategy={rectSortingStrategy}>
          <div className="flex w-max items-start p-3 sm:p-4">
            {columns.map((column, columnIndex) => {
              const columnWidth = Math.max(
                ...column.panes.map((pane) => workspacePaneWidth(pane, layoutWidth)),
                0,
              );
              const nextColumn = columns[columnIndex + 1];
              return (
                <div key={column.column} className="flex shrink-0 items-stretch">
                  <div className="flex shrink-0 flex-col" style={{ width: `${columnWidth}px` }}>
                    {column.panes.map((pane, rowIndex) => {
                      const defaultHeight =
                        pane.type === "terminal" ? renderedTerminalRowHeight : layoutHeight;
                      return (
                        <div key={pane.paneId} className="flex shrink-0 flex-col">
                          <div
                            className="flex shrink-0"
                            style={{ height: `${workspacePaneHeight(pane, defaultHeight)}px` }}
                          >
                            <SortableWorkspacePane hostWidth={layoutWidth} pane={pane}>
                              {renderPane(pane)}
                            </SortableWorkspacePane>
                          </div>
                          {column.panes[rowIndex + 1] ? (
                            <VerticalResizeHandle
                              label={`Resize ${pane.title} pane`}
                              onPointerDown={(event) =>
                                handleVerticalResizePointerDown(event, pane)
                              }
                              onPointerMove={handleVerticalResizePointerMove}
                              onPointerUp={finishVerticalResize}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  {nextColumn ? (
                    <HorizontalResizeHandle
                      label={`Resize ${column.panes[0]!.title} pane`}
                      onPointerDown={(event) =>
                        handleHorizontalResizePointerDown(
                          event,
                          column.panes[0]!.paneId,
                          nextColumn.panes[0]!.paneId,
                        )
                      }
                      onPointerMove={handleHorizontalResizePointerMove}
                      onPointerUp={finishHorizontalResize}
                    />
                  ) : null}
                </div>
              );
            })}
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
      className="relative z-30 w-3 shrink-0 self-stretch cursor-col-resize touch-none"
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
      className="relative z-30 flex h-3 w-full shrink-0 cursor-row-resize items-center touch-none"
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
