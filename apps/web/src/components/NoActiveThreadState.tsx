import { SidebarInset, SidebarTrigger } from "./ui/sidebar";
import { WorkspacePane, WorkspaceShell } from "./WorkspaceShell";

export function NoActiveThreadState() {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <WorkspaceShell
        title="No active workspace"
        subtitle="Choose a workspace from the rail, then reopen a thread inside its AI pane."
        headerActions={<SidebarTrigger className="size-8 shrink-0 md:hidden" />}
        aside={
          <div className="min-h-0 space-y-3">
            <WorkspacePane
              label="Surface deck"
              title="Peer pane space stays reserved"
              description="The shell keeps room for AI, terminal, diff, and planning surfaces even before one is active."
            >
              <div className="space-y-3 p-4 text-sm text-muted-foreground">
                <p>Collapse the left rail whenever you want a wider workspace scene.</p>
                <p>Reopen any thread to bring the AI pane back without leaving the shell.</p>
              </div>
            </WorkspacePane>
          </div>
        }
      >
        <WorkspacePane
          label="AI pane"
          title="Pick a thread to continue"
          description="Select an existing thread or create a new one to reopen the workspace conversation surface."
          bodyClassName="flex items-center justify-center p-6 sm:p-8"
        >
          <div className="w-full max-w-lg rounded-[1.5rem] border border-dashed border-border/70 bg-card/30 px-8 py-12 text-center shadow-sm">
            <h3 className="text-xl font-semibold tracking-tight text-foreground">
              Waiting for an active thread
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The current workspace shell is ready. Choose a thread from the rail to load the AI
              pane and recover the rest of your working context.
            </p>
          </div>
        </WorkspacePane>
      </WorkspaceShell>
    </SidebarInset>
  );
}
