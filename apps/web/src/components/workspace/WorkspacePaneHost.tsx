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
} from "~/workspacePaneLayout";
import { cn } from "~/lib/utils";

interface WorkspacePaneDragHandleValue {
  readonly attributes: ReturnType<typeof useSortable>["attributes"];
  readonly listeners: ReturnType<typeof useSortable>["listeners"];
  readonly setActivatorNodeRef: ReturnType<typeof useSortable>["setActivatorNodeRef"];
}

const WorkspacePaneDragHandleContext = createContext<WorkspacePaneDragHandleValue | null>(null);

export function useWorkspacePaneDragHandle(): WorkspacePaneDragHandleValue | null {
  return useContext(WorkspacePaneDragHandleContext);
}

interface SortableWorkspacePaneProps {
  readonly hostWidth: number;
  readonly pane: PersistedWorkspaceDockedPane;
  readonly children: ReactNode;
}

function SortableWorkspacePane({ children, hostWidth, pane }: SortableWorkspacePaneProps) {
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
  readonly onPanesChange: (panes: readonly PersistedWorkspaceDockedPane[]) => void;
}

export function WorkspacePaneHost({ onPanesChange, panes, renderPane }: WorkspacePaneHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const resizeStateRef = useRef<{
    pointerId: number;
    paneId: string;
    startX: number;
    panes: readonly PersistedWorkspaceDockedPane[];
  } | null>(null);
  const [hostWidth, setHostWidth] = useState(1_280);
  const [previewPanes, setPreviewPanes] = useState<readonly PersistedWorkspaceDockedPane[] | null>(
    null,
  );
  const renderedPanes = previewPanes ?? panes;
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

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, paneId: string) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      resizeStateRef.current = {
        pointerId: event.pointerId,
        paneId,
        startX: event.clientX,
        panes,
      };
      setPreviewPanes(panes);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [panes],
  );

  const handleResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }
      setPreviewPanes(
        resizeAdjacentWorkspacePanes(
          resizeState.panes,
          resizeState.paneId,
          event.clientX - resizeState.startX,
          hostWidth,
        ),
      );
    },
    [hostWidth],
  );

  const finishResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const nextPanes = resizeAdjacentWorkspacePanes(
        resizeState.panes,
        resizeState.paneId,
        event.clientX - resizeState.startX,
        hostWidth,
      );
      resizeStateRef.current = null;
      setPreviewPanes(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onPanesChange(nextPanes);
    },
    [hostWidth, onPanesChange],
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
      className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain"
      data-testid="workspace-pane-host"
    >
      <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext
          items={renderedPanes.map((pane) => pane.paneId)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex h-full min-h-[48rem] w-max items-stretch gap-3 p-3 sm:p-4">
            {renderedPanes.map((pane, index) => (
              <div key={pane.paneId} className="relative flex h-full shrink-0">
                <SortableWorkspacePane hostWidth={hostWidth} pane={pane}>
                  {renderPane(pane)}
                </SortableWorkspacePane>
                {index < renderedPanes.length - 1 ? (
                  <div
                    role="separator"
                    aria-label={`Resize ${pane.title} pane`}
                    aria-orientation="vertical"
                    className="absolute -right-2 top-0 z-30 h-full w-4 cursor-col-resize touch-none"
                    onPointerDown={(event) => handleResizePointerDown(event, pane.paneId)}
                    onPointerMove={handleResizePointerMove}
                    onPointerUp={finishResize}
                    onPointerCancel={finishResize}
                  >
                    <div className="mx-auto h-full w-px bg-transparent transition-colors hover:bg-ring/70" />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
