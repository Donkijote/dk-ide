const WORKSPACE_AI_PANE_SELECTOR = '[data-workspace-pane-id="ai"], [data-workspace-pane-id^="ai:"]';

function isWorkspaceAiPaneElement(element: Element | null): boolean {
  return Boolean(element?.matches(WORKSPACE_AI_PANE_SELECTOR));
}

export function isWorkspaceAiPaneFocused(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const activeWorkspacePane = document.querySelector<HTMLElement>(
    '[data-workspace-pane-active="true"] [data-workspace-pane-id]',
  );
  if (isWorkspaceAiPaneElement(activeWorkspacePane)) {
    return true;
  }

  const activeElement = document.activeElement;
  return activeElement instanceof Element
    ? Boolean(activeElement.closest(WORKSPACE_AI_PANE_SELECTOR))
    : false;
}
