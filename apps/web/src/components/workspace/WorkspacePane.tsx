import { CheckIcon, GripVerticalIcon, PencilIcon, XIcon } from "lucide-react";
import { type FormEvent, type ReactNode, type Ref, useEffect, useId, useState } from "react";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useWorkspacePaneDragHandle } from "./WorkspacePaneHost";

interface WorkspacePaneProps {
  readonly actions?: ReactNode;
  readonly bodyClassName?: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly description?: ReactNode;
  readonly isActive?: boolean;
  readonly leadingActions?: ReactNode;
  readonly onTitleRename?: (title: string | null) => void;
  readonly rootRef?: Ref<HTMLElement>;
  readonly title: string;
  readonly titleActions?: ReactNode;
  readonly titleControl?: ReactNode;
  readonly titleInputLabel?: string;
  readonly titleRenameLabel?: string;
}

export function WorkspacePane({
  actions,
  bodyClassName,
  children,
  className,
  description,
  isActive = false,
  leadingActions,
  onTitleRename,
  rootRef,
  title,
  titleActions,
  titleControl,
  titleInputLabel = "Pane title",
  titleRenameLabel = "Rename pane",
}: WorkspacePaneProps) {
  const dragHandle = useWorkspacePaneDragHandle();
  const inputId = useId();
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);

  useEffect(() => {
    if (!editingTitle) {
      setDraftTitle(title);
    }
  }, [editingTitle, title]);

  const submitTitle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = draftTitle.trim().replace(/\s+/g, " ");
    onTitleRename?.(nextTitle.length > 0 ? nextTitle : null);
    setEditingTitle(false);
  };

  return (
    <section
      ref={rootRef}
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-border/70 bg-background shadow-[0_20px_50px_-32px_rgba(15,23,42,0.35)]",
        isActive && "border-ring/70 ring-1 ring-ring/45 shadow-lg",
        className,
      )}
      data-workspace-pane-frame-active={isActive ? "true" : undefined}
    >
      <header
        className={cn(
          "shrink-0 border-b border-border/60 bg-background",
          isActive && "border-ring/40 bg-accent/35",
        )}
      >
        <div className="flex min-h-14 min-w-0 items-center gap-3 px-3 py-2 sm:px-4">
          {dragHandle ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    ref={dragHandle.setActivatorNodeRef}
                    type="button"
                    className="inline-flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing"
                    aria-label={`Move ${title} pane`}
                    {...dragHandle.attributes}
                    {...dragHandle.listeners}
                  >
                    <GripVerticalIcon className="size-4" />
                  </button>
                }
              />
              <TooltipPopup side="bottom">Drag to move pane</TooltipPopup>
            </Tooltip>
          ) : null}
          {leadingActions ? (
            <div className="flex shrink-0 items-center gap-1">{leadingActions}</div>
          ) : null}
          <div className="min-w-0 flex-1">
            {editingTitle ? (
              <form className="flex min-w-0 items-center gap-1.5" onSubmit={submitTitle}>
                <label htmlFor={inputId} className="sr-only">
                  {titleInputLabel}
                </label>
                <input
                  id={inputId}
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setDraftTitle(title);
                      setEditingTitle(false);
                    }
                  }}
                  className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus:border-ring"
                  autoFocus
                />
                <button
                  type="submit"
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label={`Save ${titleInputLabel.toLowerCase()}`}
                >
                  <CheckIcon className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label={`Cancel ${titleInputLabel.toLowerCase()} rename`}
                  onClick={() => {
                    setDraftTitle(title);
                    setEditingTitle(false);
                  }}
                >
                  <XIcon className="size-3.5" />
                </button>
              </form>
            ) : (
              <div className="flex min-w-0 items-center gap-1.5">
                {titleControl ?? (
                  <h2
                    className="min-w-0 truncate font-semibold text-foreground text-sm sm:text-[0.95rem]"
                    title={title}
                  >
                    {title}
                  </h2>
                )}
                {onTitleRename ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-70 transition-colors hover:bg-accent hover:text-foreground hover:opacity-100"
                          aria-label={titleRenameLabel}
                          onClick={() => {
                            setDraftTitle(title);
                            setEditingTitle(true);
                          }}
                        >
                          <PencilIcon className="size-3.5" />
                        </button>
                      }
                    />
                    <TooltipPopup side="bottom">{titleRenameLabel}</TooltipPopup>
                  </Tooltip>
                ) : null}
                {titleActions ? (
                  <div className="flex shrink-0 items-center gap-1">{titleActions}</div>
                ) : null}
              </div>
            )}
            {description ? (
              <p className="truncate text-muted-foreground text-xs">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      </header>
      <div className={cn("flex min-h-0 min-w-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}
