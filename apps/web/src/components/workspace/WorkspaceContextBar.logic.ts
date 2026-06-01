export type WorkspaceContextItemKind = "environment" | "resource" | "root" | "branch" | "thread";

export interface WorkspaceContextItem {
  readonly kind: WorkspaceContextItemKind;
  readonly label: string;
  readonly value: string;
  readonly title?: string | undefined;
}

export interface WorkspaceContextInput {
  readonly activeThreadTitle: string | null | undefined;
  readonly branchName: string | null | undefined;
  readonly environmentLabel: string | null | undefined;
  readonly repositoryLabel: string | null | undefined;
  readonly workspaceRoot: string | null | undefined;
}

function basenameOfPath(path: string): string {
  const normalizedPath = path.replace(/\\/g, "/").replace(/\/+$/g, "");
  const separatorIndex = normalizedPath.lastIndexOf("/");
  return separatorIndex === -1 ? normalizedPath : normalizedPath.slice(separatorIndex + 1);
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function buildWorkspaceContextItems(input: WorkspaceContextInput): WorkspaceContextItem[] {
  const items: WorkspaceContextItem[] = [];
  const environmentLabel = nonEmpty(input.environmentLabel);
  const repositoryLabel = nonEmpty(input.repositoryLabel);
  const workspaceRoot = nonEmpty(input.workspaceRoot);
  const branchName = nonEmpty(input.branchName);
  const activeThreadTitle = nonEmpty(input.activeThreadTitle);

  if (environmentLabel) {
    items.push({
      kind: "environment",
      label: "Env",
      value: environmentLabel,
    });
  }

  if (activeThreadTitle) {
    items.push({
      kind: "thread",
      label: "Context",
      value: activeThreadTitle,
    });
  }

  if (repositoryLabel) {
    items.push({
      kind: "resource",
      label: "Repo",
      value: repositoryLabel,
    });
  }

  if (workspaceRoot) {
    items.push({
      kind: "root",
      label: "Root",
      value: basenameOfPath(workspaceRoot) || workspaceRoot,
      title: workspaceRoot,
    });
  }

  if (branchName) {
    items.push({
      kind: "branch",
      label: "Branch",
      value: branchName,
    });
  }

  return items;
}
