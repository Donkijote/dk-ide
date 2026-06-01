import { memo } from "react";
import {
  BoxesIcon,
  FolderGit2Icon,
  GitBranchIcon,
  MonitorIcon,
  RouteIcon,
  WaypointsIcon,
} from "lucide-react";

import { SidebarTrigger } from "../ui/sidebar";
import { cn } from "~/lib/utils";
import type { WorkspaceContextItem } from "../workspace/WorkspaceContextBar.logic";

interface ChatHeaderProps {
  activeThreadTitle: string;
  workspaceName: string | null;
  workspaceContextItems?: readonly WorkspaceContextItem[];
  showWorkspaceContext?: boolean;
  showThreadTitle?: boolean;
}

const contextIcons = {
  branch: GitBranchIcon,
  environment: MonitorIcon,
  resource: FolderGit2Icon,
  root: BoxesIcon,
  thread: RouteIcon,
} satisfies Record<WorkspaceContextItem["kind"], typeof WaypointsIcon>;

const EMPTY_WORKSPACE_CONTEXT_ITEMS: readonly WorkspaceContextItem[] = [];

export const ChatHeader = memo(function ChatHeader({
  activeThreadTitle,
  workspaceName,
  workspaceContextItems = EMPTY_WORKSPACE_CONTEXT_ITEMS,
  showWorkspaceContext = true,
  showThreadTitle = true,
}: ChatHeaderProps) {
  const visibleContextItems = workspaceContextItems.filter((item) => item.value.trim().length > 0);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
      {showWorkspaceContext ? (
        <div className="flex min-w-0 flex-1 items-start gap-2 overflow-hidden sm:gap-3">
          <SidebarTrigger className="size-7 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2 overflow-hidden sm:gap-3">
              {workspaceName ? (
                <span className="min-w-0 shrink truncate text-sm font-medium text-foreground">
                  {workspaceName}
                </span>
              ) : null}
              {showThreadTitle ? (
                <h2
                  className="min-w-0 shrink truncate text-sm font-medium text-muted-foreground"
                  title={activeThreadTitle}
                >
                  {activeThreadTitle}
                </h2>
              ) : null}
            </div>
            {visibleContextItems.length > 0 ? (
              <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {visibleContextItems.map((item) => (
                  <WorkspaceContextPill
                    key={`${item.kind}:${item.label}:${item.value}`}
                    item={item}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="min-w-0 flex-1" />
      )}
    </div>
  );
});

function WorkspaceContextPill({ item }: { item: WorkspaceContextItem }) {
  const Icon = contextIcons[item.kind];

  return (
    <span
      className={cn(
        "inline-flex max-w-64 shrink-0 items-center gap-1.5 rounded-md border border-border/60",
        "bg-card/70 px-2 py-0.5 text-[11px] leading-4 text-muted-foreground shadow-sm/5",
      )}
      title={item.title ?? `${item.label}: ${item.value}`}
    >
      <Icon className="size-3 shrink-0 text-muted-foreground/80" />
      <span className="font-medium text-foreground/80">{item.label}</span>
      <span className="truncate">{item.value}</span>
    </span>
  );
}
