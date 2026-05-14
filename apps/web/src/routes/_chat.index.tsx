import { createFileRoute } from "@tanstack/react-router";
import { LinkIcon, PlusIcon } from "lucide-react";

import { NoActiveThreadState } from "../components/NoActiveThreadState";
import { Button } from "../components/ui/button";
import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import { WorkspacePane, WorkspaceShell } from "../components/WorkspaceShell";
import { useSavedEnvironmentRegistryStore } from "../environments/runtime";
import { APP_DISPLAY_NAME } from "~/branding";

function ChatIndexRouteView() {
  const { authGateState } = Route.useRouteContext();
  const savedEnvironmentCount = useSavedEnvironmentRegistryStore(
    (state) => Object.keys(state.byId).length,
  );

  if (authGateState.status === "hosted-static" && savedEnvironmentCount === 0) {
    return <HostedStaticOnboardingState />;
  }

  return <NoActiveThreadState />;
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});

function HostedStaticOnboardingState() {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <WorkspaceShell
        title={APP_DISPLAY_NAME}
        subtitle="Connect an environment to bring the first workspace shell online in this browser."
        headerActions={<SidebarTrigger className="size-8 shrink-0 md:hidden" />}
        aside={
          <WorkspacePane
            label="Workspace context"
            title="Environment access is the first attachment"
            description="Saved environments stay local to this browser, so the workspace shell can reconnect without rebuilding your setup each time."
          >
            <div className="space-y-3 p-4 text-sm text-muted-foreground">
              <p>Pair with the desktop app for a local workspace or add a reachable backend.</p>
              <p>The left rail becomes your workspace switcher once at least one environment is attached.</p>
            </div>
          </WorkspacePane>
        }
      >
        <WorkspacePane
          label="Workspace bootstrap"
          title="Connect an environment to get started"
          description="Open a pairing link from your desktop app or add a reachable backend manually."
          bodyClassName="flex items-center justify-center p-6 sm:p-8"
        >
          <div className="w-full max-w-xl rounded-[1.5rem] border border-border/60 bg-card/35 px-8 py-12 text-center shadow-sm">
            <div className="mx-auto mb-5 flex size-11 items-center justify-center rounded-xl border border-border/70 bg-background/70 text-muted-foreground">
              <LinkIcon className="size-5" />
            </div>
            <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted-foreground/80">
              Your saved environments stay in this browser and become the first contexts inside the
              workspace shell.
            </p>
            <div className="mt-6 flex justify-center">
              <Button render={<a href="/settings/connections" />} size="sm">
                <PlusIcon className="size-4" />
                Add environment
              </Button>
            </div>
          </div>
        </WorkspacePane>
      </WorkspaceShell>
    </SidebarInset>
  );
}
