import { type ReactNode } from "react";

import { SidebarTrigger } from "./ui/sidebar";
import { cn } from "~/lib/utils";

interface WorkspaceShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  headerActions?: ReactNode;
  aside?: ReactNode;
  bottom?: ReactNode;
  className?: string;
}

interface WorkspacePaneProps {
  label: string;
  title?: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function WorkspaceShell({
  title,
  subtitle,
  children,
  headerActions,
  aside,
  bottom,
  className,
}: WorkspaceShellProps) {
  return (
    <div
      className={cn(
        "relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(48rem_18rem_at_top,color-mix(in_srgb,var(--color-sky-500)_11%,transparent),transparent)]" />
        <div className="absolute inset-y-0 right-0 w-80 bg-[radial-gradient(28rem_24rem_at_100%_20%,color-mix(in_srgb,var(--color-emerald-500)_9%,transparent),transparent)]" />
      </div>

      <header className="relative border-b border-border/70 px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-3">
            <SidebarTrigger className="mt-0.5 hidden shrink-0 md:inline-flex" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                Workspace
              </p>
              <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                {title}
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {subtitle}
              </p>
            </div>
          </div>
          {headerActions ? (
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">{headerActions}</div>
          ) : null}
        </div>
      </header>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4">
        <div
          className={cn(
            "grid min-h-0 min-w-0 flex-1 gap-3",
            aside ? "xl:grid-cols-[minmax(0,1fr)_22rem]" : undefined,
          )}
        >
          <div className="min-h-0 min-w-0">{children}</div>
          {aside ? <aside className="hidden min-h-0 xl:flex xl:flex-col">{aside}</aside> : null}
        </div>
        {bottom ? <div className="mt-3 min-h-0 min-w-0">{bottom}</div> : null}
      </div>
    </div>
  );
}

export function WorkspacePane({
  label,
  title,
  description,
  children,
  actions,
  className,
  bodyClassName,
}: WorkspacePaneProps) {
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/90 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.55)] backdrop-blur-sm",
        className,
      )}
    >
      <header className="border-b border-border/60 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              {label}
            </p>
            {title ? (
              <h2 className="mt-1 text-base font-semibold tracking-tight text-foreground">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      </header>
      <div className={cn("min-h-0 min-w-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}
