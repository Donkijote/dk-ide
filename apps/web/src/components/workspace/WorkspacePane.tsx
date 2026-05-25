import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

interface WorkspacePaneProps {
  readonly actions?: ReactNode;
  readonly bodyClassName?: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly description?: ReactNode;
  readonly title: ReactNode;
}

export function WorkspacePane({
  actions,
  bodyClassName,
  children,
  className,
  description,
  title,
}: WorkspacePaneProps) {
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-border/70 bg-background shadow-[0_20px_50px_-32px_rgba(15,23,42,0.35)]",
        className,
      )}
    >
      <header className="border-b border-border/60 bg-background">
        <div className="flex min-w-0 items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold text-foreground text-sm sm:text-[0.95rem]">
              {title}
            </h2>
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
