import "../../index.css";

import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import type { PersistedWorkspaceDockedPane } from "~/uiStateStore";
import { WORKSPACE_PANE_GAP, workspacePaneDefaultWidth } from "~/workspacePaneLayout";
import { WorkspacePaneHost } from "./WorkspacePaneHost";

const HOST_WIDTH = 1_280;
const EDITOR_WIDTH = workspacePaneDefaultWidth({ paneId: "editor" }, HOST_WIDTH);
const AI_WIDTH = workspacePaneDefaultWidth({ paneId: "ai" }, HOST_WIDTH);
const PANES: readonly PersistedWorkspaceDockedPane[] = [
  {
    paneId: "editor",
    type: "editor",
    title: "Editor",
    environmentId: "local",
    cwd: "/repo",
    order: 0,
    size: 1,
    widthPreset: "large",
    dockColumn: 0,
    dockRow: 0,
    dockX: 0,
    dockY: 0,
    metadata: {},
  },
  {
    paneId: "ai",
    type: "ai",
    title: "AI",
    environmentId: "local",
    cwd: "/repo",
    order: 1,
    size: 1,
    widthPreset: "large",
    dockColumn: 1,
    dockRow: 0,
    dockX: Math.round(EDITOR_WIDTH + WORKSPACE_PANE_GAP),
    dockY: 0,
    metadata: { threadId: "thread-1" },
  },
  {
    paneId: "terminal",
    type: "terminal",
    title: "Terminal",
    environmentId: "local",
    cwd: "/repo",
    order: 2,
    size: 1,
    widthPreset: "medium",
    dockColumn: 2,
    dockRow: 0,
    dockX: Math.round(EDITOR_WIDTH + AI_WIDTH + WORKSPACE_PANE_GAP * 2),
    dockY: 0,
    metadata: { threadId: "thread-1" },
  },
];

function StreamingPaneFixture({
  onPanesChange,
}: {
  onPanesChange: (panes: readonly PersistedWorkspaceDockedPane[]) => void;
}) {
  const [update, setUpdate] = useState(0);

  return (
    <div className="relative flex h-[768px] w-[1280px]">
      <WorkspacePaneHost
        panes={PANES}
        terminalRowHeight={280}
        onPanesChange={onPanesChange}
        renderPane={(pane) => (
          <div className="h-full w-full" data-testid={`${pane.paneId}-content`}>
            {pane.paneId === "ai" ? `Streaming update ${update}` : pane.title}
          </div>
        )}
      />
      <button
        type="button"
        className="absolute right-0 top-0 z-50"
        data-testid="stream-update"
        onClick={() => setUpdate((value) => value + 1)}
      >
        Update
      </button>
    </div>
  );
}

describe("WorkspacePaneHost", () => {
  it("keeps the AI pane mounted and stationary across streamed content updates", async () => {
    const onPanesChange = vi.fn();
    const screen = await render(<StreamingPaneFixture onPanesChange={onPanesChange} />);
    const aiPane = document.querySelector<HTMLElement>('[data-workspace-pane-id="ai"]');
    expect(aiPane).not.toBeNull();
    const initialRect = aiPane!.getBoundingClientRect();

    for (let update = 1; update <= 5; update += 1) {
      await page.getByTestId("stream-update").click();
      await expect
        .element(page.getByTestId("ai-content"))
        .toHaveTextContent(`Streaming update ${update}`);
      expect(document.querySelector('[data-workspace-pane-id="ai"]')).toBe(aiPane);
      expect(aiPane!.getBoundingClientRect()).toEqual(initialRect);
    }

    expect(onPanesChange).not.toHaveBeenCalled();
    await screen.unmount();
  });
});
