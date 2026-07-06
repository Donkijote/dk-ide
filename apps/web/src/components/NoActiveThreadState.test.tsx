import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { useUiStateStore } from "../uiStateStore";
import { SidebarProvider } from "./ui/sidebar";
import { NoActiveThreadState } from "./NoActiveThreadState";

describe("NoActiveThreadState", () => {
  afterEach(() => {
    useUiStateStore.setState({
      workspaceShellSidebarOpen: true,
      workspaceThreadLayoutById: {},
    });
  });

  it("renders a recovery surface when persisted workspace panes exist", () => {
    useUiStateStore.setState({
      workspaceShellSidebarOpen: false,
      workspaceThreadLayoutById: {
        "environment:test-thread": {
          activePaneId: "ai",
          panes: [
            {
              paneId: "ai",
              type: "ai",
              title: "Saved thread",
              environmentId: "environment",
              cwd: "/repo",
              order: 0,
              size: 1,
              metadata: { threadId: "test-thread" },
            },
          ],
        },
      },
    });

    const html = renderToStaticMarkup(
      <SidebarProvider open={false}>
        <NoActiveThreadState />
      </SidebarProvider>,
    );

    expect(html).toContain("No active workspace");
    expect(html).toContain("Pick a workspace to continue");
  });
});
