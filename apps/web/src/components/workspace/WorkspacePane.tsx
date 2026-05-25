import type { ReactNode } from "react";

import { Badge } from "../ui/badge";
import { cn } from "~/lib/utils";

interface WorkspacePaneProps {
  readonly actions?: ReactNode;
  readonly bodyClassName?: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly description?: ReactNode;
  readonly icon?: ReactNode;
  readonly label: ReactNode;
  readonly title: ReactNode;
}

export function WorkspacePane({
  actions,
  bodyClassName,
  children,
  className,
  description,
  icon,
  label,
  title,
}: WorkspacePaneProps) {
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-border/70 bg-background shadow-[0_20px_50px_-32px_rgba(15,23,42,0.35)]",
        className,
      )}
    >
      <header className="relative border-b border-border/60 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_90%,var(--color-sky-500)_10%)_0%,color-mix(in_srgb,var(--background)_96%,transparent)_45%,color-mix(in_srgb,var(--background)_90%,var(--color-emerald-500)_10%)_100%)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--color-sky-500)_55%,transparent),transparent)]" />
        <div className="flex min-w-0 items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Badge
              variant="outline"
              size="sm"
              className="gap-1.5 border-border/70 bg-background/80 font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.18em] shadow-sm backdrop-blur-sm"
            >
              {icon}
              {label}
            </Badge>
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-foreground text-sm sm:text-[0.95rem]">
                {title}
              </h2>
              {description ? (
                <p className="truncate text-muted-foreground text-xs">{description}</p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      </header>
      <div className={cn("flex min-h-0 min-w-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}
