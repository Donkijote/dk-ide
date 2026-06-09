import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  createContext,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { PersistedWorkspaceDockedPane } from "~/uiStateStore";
import {
  reorderWorkspacePanes,
  resizeAdjacentWorkspacePanes,
  workspacePaneWidth,
  workspaceTerminalRowHeight,
} from "~/workspacePaneLayout";
import { cn } from "~/lib/utils";

const WORKSPACE_PANE_GAP = 12;

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

function WorkspacePaneContainer({ children, hostWidth, pane }: WorkspacePaneContainerProps) {
  return (
    <div
      className="flex h-full shrink-0 flex-col"
      data-workspace-pane-id={pane.paneId}
      style={{ width: `${workspacePaneWidth(pane, hostWidth)}px` }}
    >
      {children}
    </div>
  );
}

function SortableWorkspacePane({ children, hostWidth, pane }: WorkspacePaneContainerProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: pane.paneId });
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
          transition,
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
  readonly onTerminalRowHeightChange: (height: number) => void;
}

export function WorkspacePaneHost({
  onPanesChange,
  onTerminalRowHeightChange,
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
    startHeight: number;
    startY: number;
  } | null>(null);
  const [hostWidth, setHostWidth] = useState(1_280);
  const [previewPanes, setPreviewPanes] = useState<readonly PersistedWorkspaceDockedPane[] | null>(
    null,
  );
  const [previewTerminalRowHeight, setPreviewTerminalRowHeight] = useState<number | null>(null);
  const renderedPanes = previewPanes ?? panes;
  const renderedTerminalRowHeight = workspaceTerminalRowHeight(
    previewTerminalRowHeight ?? terminalRowHeight,
  );
  const editorPane = renderedPanes.find((pane) => pane.paneId === "editor") ?? null;
  const aiPane = renderedPanes.find((pane) => pane.paneId === "ai") ?? null;
  const lowerPanes = renderedPanes.filter(
    (pane) => pane.paneId !== editorPane?.paneId && pane.paneId !== aiPane?.paneId,
  );
  const lowerRowWidth =
    lowerPanes.reduce((width, pane) => width + workspacePaneWidth(pane, hostWidth), 0) +
    Math.max(0, lowerPanes.length - 1) * WORKSPACE_PANE_GAP;
  const rightDockWidth = Math.max(
    aiPane ? workspacePaneWidth(aiPane, hostWidth) : 0,
    lowerRowWidth,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const updateHostWidth = () => setHostWidth(host.clientWidth);
    updateHostWidth();
    const observer = new ResizeObserver(updateHostWidth);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) {
        return;
      }
      onPanesChange(reorderWorkspacePanes(panes, String(active.id), String(over.id)));
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
        hostWidth,
      );
      const resizedById = new Map(resizedPair.map((pane) => [pane.paneId, pane]));
      return sourcePanes.map((pane) => resizedById.get(pane.paneId) ?? pane);
    },
    [hostWidth],
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
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      verticalResizeStateRef.current = {
        pointerId: event.pointerId,
        startHeight: renderedTerminalRowHeight,
        startY: event.clientY,
      };
      setPreviewTerminalRowHeight(renderedTerminalRowHeight);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    [renderedTerminalRowHeight],
  );

  const handleVerticalResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = verticalResizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }
      setPreviewTerminalRowHeight(
        workspaceTerminalRowHeight(resizeState.startHeight + resizeState.startY - event.clientY),
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
      const nextHeight = workspaceTerminalRowHeight(
        resizeState.startHeight + resizeState.startY - event.clientY,
      );
      verticalResizeStateRef.current = null;
      setPreviewTerminalRowHeight(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onTerminalRowHeightChange(nextHeight);
    },
    [onTerminalRowHeightChange],
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
      <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex h-full min-h-[48rem] w-max items-stretch gap-3 p-3 sm:p-4">
          {editorPane ? (
            <WorkspacePaneContainer hostWidth={hostWidth} pane={editorPane}>
              {renderPane(editorPane)}
            </WorkspacePaneContainer>
          ) : null}

          {editorPane && (aiPane || lowerPanes[0]) ? (
            <HorizontalResizeHandle
              label={`Resize ${editorPane.title} pane`}
              onPointerDown={(event) =>
                handleHorizontalResizePointerDown(
                  event,
                  editorPane.paneId,
                  (aiPane ?? lowerPanes[0])!.paneId,
                )
              }
              onPointerMove={handleHorizontalResizePointerMove}
              onPointerUp={finishHorizontalResize}
            />
          ) : null}

          {aiPane || lowerPanes.length > 0 ? (
            <div
              className="relative flex h-full shrink-0 flex-col gap-3"
              style={{ width: `${rightDockWidth}px` }}
            >
              {aiPane ? (
                <div
                  className="flex min-h-[32rem] flex-1 flex-col"
                  data-workspace-pane-id={aiPane.paneId}
                  style={{ width: `${workspacePaneWidth(aiPane, hostWidth)}px` }}
                >
                  {renderPane(aiPane)}
                </div>
              ) : null}

              {aiPane && lowerPanes.length > 0 ? (
                <VerticalResizeHandle
                  label={`Resize ${lowerPanes[0]!.title} row`}
                  onPointerDown={handleVerticalResizePointerDown}
                  onPointerMove={handleVerticalResizePointerMove}
                  onPointerUp={finishVerticalResize}
                />
              ) : null}

              {lowerPanes.length > 0 ? (
                <SortableContext
                  items={lowerPanes.map((pane) => pane.paneId)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div
                    className="flex shrink-0 items-stretch gap-3"
                    data-testid="workspace-terminal-row"
                    style={{ height: `${renderedTerminalRowHeight}px` }}
                  >
                    {lowerPanes.map((pane, index) => (
                      <div key={pane.paneId} className="relative flex h-full shrink-0">
                        <SortableWorkspacePane hostWidth={hostWidth} pane={pane}>
                          {renderPane(pane)}
                        </SortableWorkspacePane>
                        {lowerPanes[index + 1] ? (
                          <HorizontalResizeHandle
                            label={`Resize ${pane.title} pane`}
                            onPointerDown={(event) =>
                              handleHorizontalResizePointerDown(
                                event,
                                pane.paneId,
                                lowerPanes[index + 1]!.paneId,
                              )
                            }
                            onPointerMove={handleHorizontalResizePointerMove}
                            onPointerUp={finishHorizontalResize}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </SortableContext>
              ) : null}
            </div>
          ) : null}
        </div>
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
