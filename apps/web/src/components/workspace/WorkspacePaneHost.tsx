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
  workspacePaneHeight,
  workspacePanePlacements,
  workspacePaneWidth,
  workspaceTerminalRowHeight,
} from "~/workspacePaneLayout";
import { cn } from "~/lib/utils";

const WORKSPACE_PANE_GAP = 12;
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
  const panePlacements = useMemo(() => workspacePanePlacements(renderedPanes), [renderedPanes]);
  const primaryPane =
    renderedPanes.find((pane) => panePlacements.get(pane.paneId)?.slot === "primary") ?? null;
  const upperPanes = renderedPanes
    .filter((pane) => panePlacements.get(pane.paneId)?.slot === "upper")
    .toSorted(
      (left, right) =>
        (panePlacements.get(left.paneId)?.column ?? 0) -
        (panePlacements.get(right.paneId)?.column ?? 0),
    );
  const resizableUpperPane = upperPanes.find((pane) => pane.type === "ai") ?? upperPanes[0] ?? null;
  const gridColumns = useMemo(() => {
    const columns = new Map<number, PersistedWorkspaceDockedPane[]>();
    for (const pane of renderedPanes) {
      const placement = panePlacements.get(pane.paneId);
      if (placement?.slot !== "grid") {
        continue;
      }
      const column = columns.get(placement.column) ?? [];
      column.push(pane);
      columns.set(placement.column, column);
    }
    return [...columns.entries()]
      .toSorted(([leftColumn], [rightColumn]) => leftColumn - rightColumn)
      .map(([column, columnPanes]) => ({
        column,
        panes: columnPanes.toSorted(
          (left, right) =>
            (panePlacements.get(left.paneId)?.row ?? 0) -
            (panePlacements.get(right.paneId)?.row ?? 0),
        ),
      }));
  }, [panePlacements, renderedPanes]);
  const lowerRowWidth =
    gridColumns.reduce(
      (width, column) =>
        width + Math.max(...column.panes.map((pane) => workspacePaneWidth(pane, layoutWidth)), 0),
      0,
    ) +
    Math.max(0, gridColumns.length - 1) * WORKSPACE_PANE_GAP;
  const upperRowWidth =
    upperPanes.reduce((width, pane) => width + workspacePaneWidth(pane, layoutWidth), 0) +
    Math.max(0, upperPanes.length - 1) * WORKSPACE_PANE_GAP;
  const rightDockWidth = Math.max(upperRowWidth, lowerRowWidth);
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
      verticalResizeStateRef.current = {
        pointerId: event.pointerId,
        paneId: pane.paneId,
        startHeight: workspacePaneHeight(pane, layoutHeight),
        startY: event.clientY,
        panes,
      };
      setPreviewPanes(panes);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    [layoutHeight, panes],
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
          layoutHeight,
        ),
      );
    },
    [layoutHeight],
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
        layoutHeight,
      );
      verticalResizeStateRef.current = null;
      setPreviewPanes(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onPanesChange(nextPanes);
    },
    [layoutHeight, onPanesChange],
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
          <div className="flex w-max items-start gap-3 p-3 sm:p-4">
            {primaryPane ? (
              <div className="flex shrink-0" style={{ height: `${layoutHeight}px` }}>
                <SortableWorkspacePane hostWidth={layoutWidth} pane={primaryPane}>
                  {renderPane(primaryPane)}
                </SortableWorkspacePane>
              </div>
            ) : null}

            {primaryPane && (upperPanes[0] || gridColumns[0]?.panes[0]) ? (
              <HorizontalResizeHandle
                label={`Resize ${primaryPane.title} pane`}
                onPointerDown={(event) =>
                  handleHorizontalResizePointerDown(
                    event,
                    primaryPane.paneId,
                    (upperPanes[0] ?? gridColumns[0]!.panes[0])!.paneId,
                  )
                }
                onPointerMove={handleHorizontalResizePointerMove}
                onPointerUp={finishHorizontalResize}
              />
            ) : null}

            {upperPanes.length > 0 || gridColumns.length > 0 ? (
              <div
                className="relative flex shrink-0 flex-col gap-3"
                style={{ width: `${rightDockWidth}px` }}
              >
                {upperPanes.length > 0 ? (
                  <div className="flex shrink-0 items-start gap-3">
                    {upperPanes.map((pane, paneIndex) => (
                      <div key={pane.paneId} className="relative flex shrink-0 items-stretch">
                        <div
                          className="flex shrink-0"
                          style={{
                            height: `${
                              pane.type === "terminal"
                                ? renderedTerminalRowHeight
                                : workspacePaneHeight(pane, layoutHeight)
                            }px`,
                          }}
                        >
                          <SortableWorkspacePane hostWidth={layoutWidth} pane={pane}>
                            {renderPane(pane)}
                          </SortableWorkspacePane>
                        </div>
                        {upperPanes[paneIndex + 1] ? (
                          <HorizontalResizeHandle
                            label={`Resize ${pane.title} pane`}
                            onPointerDown={(event) =>
                              handleHorizontalResizePointerDown(
                                event,
                                pane.paneId,
                                upperPanes[paneIndex + 1]!.paneId,
                              )
                            }
                            onPointerMove={handleHorizontalResizePointerMove}
                            onPointerUp={finishHorizontalResize}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {resizableUpperPane && gridColumns.length > 0 ? (
                  <VerticalResizeHandle
                    label={`Resize ${resizableUpperPane.title} pane`}
                    onPointerDown={(event) =>
                      handleVerticalResizePointerDown(event, resizableUpperPane)
                    }
                    onPointerMove={handleVerticalResizePointerMove}
                    onPointerUp={finishVerticalResize}
                  />
                ) : null}

                {gridColumns.length > 0 ? (
                  <div
                    className="flex shrink-0 items-start gap-3"
                    data-testid="workspace-terminal-row"
                  >
                    {gridColumns.map((column, columnIndex) => (
                      <div key={column.column} className="relative flex shrink-0 items-stretch">
                        <div className="flex shrink-0 flex-col gap-3">
                          {column.panes.map((pane) => (
                            <div
                              key={pane.paneId}
                              className="flex shrink-0"
                              style={{ height: `${renderedTerminalRowHeight}px` }}
                            >
                              <SortableWorkspacePane hostWidth={layoutWidth} pane={pane}>
                                {renderPane(pane)}
                              </SortableWorkspacePane>
                            </div>
                          ))}
                        </div>
                        {gridColumns[columnIndex + 1] ? (
                          <HorizontalResizeHandle
                            label={`Resize ${column.panes[0]!.title} pane`}
                            onPointerDown={(event) =>
                              handleHorizontalResizePointerDown(
                                event,
                                column.panes[0]!.paneId,
                                gridColumns[columnIndex + 1]!.panes[0]!.paneId,
                              )
                            }
                            onPointerMove={handleHorizontalResizePointerMove}
                            onPointerUp={finishHorizontalResize}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
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
      className="relative z-30 -mx-2 h-full w-4 shrink-0 cursor-col-resize touch-none"
      onPointerCancel={onPointerUp}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="mx-auto h-full w-px bg-transparent transition-colors hover:bg-ring/70" />
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
      className="relative z-30 -my-2 h-4 w-full shrink-0 cursor-row-resize touch-none"
      onPointerCancel={onPointerUp}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="my-auto h-px w-full bg-transparent transition-colors hover:bg-ring/70" />
    </div>
  );
}
