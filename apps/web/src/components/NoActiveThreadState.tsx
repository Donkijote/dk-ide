import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { SidebarInset, SidebarTrigger, useSidebar } from "./ui/sidebar";
import { isElectron } from "../env";
import { cn } from "~/lib/utils";

export function NoActiveThreadState() {
  const { open: sidebarOpen } = useSidebar();

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <header
          className={cn(
            "border-b border-border",
            isElectron
              ? cn(
                  "drag-region flex h-[52px] items-center pr-3 sm:pr-5 wco:h-[env(titlebar-area-height)]",
                  sidebarOpen
                    ? "pl-3 sm:pl-5"
                    : "pl-[90px] sm:pl-[90px] wco:pl-[calc(env(titlebar-area-x)+1em)]",
                  "wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]",
                )
              : "px-3 py-2 sm:px-5 sm:py-3",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className={cn("size-7 shrink-0", !isElectron && "md:hidden")} />
            <span
              className={cn(
                "truncate font-medium text-sm text-foreground",
                !isElectron && "md:text-muted-foreground/60",
              )}
            >
              No active thread
            </span>
          </div>
        </header>

        <Empty className="flex-1">
          <div className="w-full max-w-lg rounded-3xl border border-border/55 bg-card/20 px-8 py-12 shadow-sm/5">
            <EmptyHeader className="max-w-none">
              <EmptyTitle className="text-foreground text-xl">Pick a thread to continue</EmptyTitle>
              <EmptyDescription className="mt-2 text-sm text-muted-foreground/78">
                Select an existing thread or create a new one to get started.
              </EmptyDescription>
            </EmptyHeader>
          </div>
        </Empty>
      </div>
    </SidebarInset>
  );
}
