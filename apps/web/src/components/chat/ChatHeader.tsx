import { memo } from "react";
import type { ReactNode } from "react";

import { SidebarTrigger } from "../ui/sidebar";

interface ChatHeaderProps {
  actions?: ReactNode;
  activeThreadTitle: string;
  workspaceName: string | null;
  showWorkspaceContext?: boolean;
  showThreadTitle?: boolean;
}

export const ChatHeader = memo(function ChatHeader({
  actions,
  activeThreadTitle,
  workspaceName,
  showWorkspaceContext = true,
  showThreadTitle = true,
}: ChatHeaderProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {showWorkspaceContext ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
          <SidebarTrigger className="size-7 shrink-0" />
          {workspaceName ? (
            <span className="min-w-0 shrink truncate text-sm text-muted-foreground">
              {workspaceName}
            </span>
          ) : null}
          {showThreadTitle ? (
            <h2
              className="min-w-0 shrink truncate text-sm font-medium text-foreground"
              title={activeThreadTitle}
            >
              {activeThreadTitle}
            </h2>
          ) : null}
        </div>
      ) : (
        <div className="min-w-0 flex-1" />
      )}
      {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
});
