import type { EnvironmentId, ProjectEntry } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { AlertCircleIcon, FileCode2Icon, LoaderCircleIcon, SearchIcon, XIcon } from "lucide-react";
import { Suspense, lazy, useCallback, useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import {
  projectReadFileQueryOptions,
  projectSearchEntriesQueryOptions,
} from "../../lib/projectReactQuery";

const MonacoCodeSurface = lazy(() => import("./MonacoCodeSurface"));

const SEARCH_LIMIT = 60;

const extensionLanguage: Record<string, string> = {
  cjs: "javascript",
  css: "css",
  cts: "typescript",
  go: "go",
  htm: "html",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsonc: "json",
  jsx: "javascript",
  md: "markdown",
  mjs: "javascript",
  mts: "typescript",
  py: "python",
  rs: "rust",
  sh: "shell",
  sql: "sql",
  ts: "typescript",
  tsx: "typescript",
  txt: "plaintext",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

function languageForPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension ? (extensionLanguage[extension] ?? "plaintext") : "plaintext";
}

function basenameOfPath(path: string): string {
  const normalizedPath = path.replace(/\\/g, "/");
  const segments = normalizedPath.split("/");
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment) {
      return segment;
    }
  }
  return path;
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to open file.";
}

function firstSearchableFiles(entries: readonly ProjectEntry[]): ProjectEntry[] {
  return entries.filter((entry) => entry.kind === "file").slice(0, SEARCH_LIMIT);
}

interface WorkspaceEditorPaneProps {
  readonly className?: string;
  readonly environmentId: EnvironmentId;
  readonly resolvedTheme: "light" | "dark";
  readonly workspaceRoot: string | undefined;
  readonly onActive?: () => void;
}

export function WorkspaceEditorPane({
  className,
  environmentId,
  resolvedTheme,
  workspaceRoot,
  onActive,
}: WorkspaceEditorPaneProps) {
  const [query, setQuery] = useState("");
  const [activePath, setActivePath] = useState<string | null>(null);
  const trimmedQuery = query.trim();
  const searchEntriesQuery = useQuery(
    projectSearchEntriesQueryOptions({
      environmentId,
      cwd: workspaceRoot ?? null,
      query: trimmedQuery,
      enabled: workspaceRoot !== undefined && trimmedQuery.length > 0,
      limit: SEARCH_LIMIT,
    }),
  );
  const files = useMemo(
    () => firstSearchableFiles(searchEntriesQuery.data?.entries ?? []),
    [searchEntriesQuery.data?.entries],
  );
  const activeFileQuery = useQuery(
    projectReadFileQueryOptions({
      environmentId,
      cwd: workspaceRoot ?? null,
      relativePath: activePath,
      enabled: workspaceRoot !== undefined && activePath !== null,
    }),
  );
  const activeLanguage = activePath ? languageForPath(activePath) : "plaintext";
  const openPath = useCallback(
    (path: string) => {
      setActivePath(path);
      setQuery("");
      onActive?.();
    },
    [onActive],
  );

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col bg-card/30", className)}>
      <div className="flex min-w-0 items-center gap-2 border-border/60 border-b px-3 py-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={onActive}
            placeholder="Search files"
            disabled={!workspaceRoot}
            className="h-8 rounded-md pl-8 text-xs"
          />
        </div>
        {activePath ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => setActivePath(null)}
            title="Close file"
          >
            <XIcon className="size-4" />
          </Button>
        ) : null}
      </div>

      {query.length > 0 ? (
        <div className="max-h-48 min-h-0 overflow-auto border-border/60 border-b bg-background/95">
          {searchEntriesQuery.isLoading || searchEntriesQuery.isFetching ? (
            <div className="flex items-center gap-2 px-3 py-2 text-muted-foreground text-xs">
              <LoaderCircleIcon className="size-3.5 animate-spin" />
              Searching
            </div>
          ) : files.length > 0 ? (
            <div className="py-1">
              {files.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  className="flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                  onClick={() => openPath(entry.path)}
                >
                  <FileCode2Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {basenameOfPath(entry.path)}
                  </span>
                  <span className="min-w-0 max-w-[45%] truncate text-muted-foreground">
                    {entry.parentPath ?? ""}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-2 text-muted-foreground text-xs">No files found</div>
          )}
        </div>
      ) : null}

      <div className="relative flex min-h-0 min-w-0 flex-1 bg-background">
        {!workspaceRoot ? (
          <div className="m-auto max-w-sm px-4 text-center text-muted-foreground text-sm">
            Workspace unavailable
          </div>
        ) : activePath === null ? (
          <div className="m-auto flex max-w-sm flex-col items-center gap-3 px-4 text-center">
            <div className="flex size-10 items-center justify-center rounded-md border border-border/70 bg-muted text-muted-foreground">
              <FileCode2Icon className="size-5" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground text-sm">No file open</p>
              <p className="text-muted-foreground text-xs">{workspaceRoot}</p>
            </div>
          </div>
        ) : activeFileQuery.isLoading ? (
          <div className="m-auto flex items-center gap-2 text-muted-foreground text-sm">
            <LoaderCircleIcon className="size-4 animate-spin" />
            Loading {basenameOfPath(activePath)}
          </div>
        ) : activeFileQuery.isError ? (
          <div className="m-auto flex max-w-sm items-start gap-3 px-4 text-sm">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="font-medium text-foreground">
                Could not open {basenameOfPath(activePath)}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                {asErrorMessage(activeFileQuery.error)}
              </p>
            </div>
          </div>
        ) : activeFileQuery.data ? (
          <Suspense
            fallback={
              <div className="m-auto flex items-center gap-2 text-muted-foreground text-sm">
                <LoaderCircleIcon className="size-4 animate-spin" />
                Loading editor
              </div>
            }
          >
            <MonacoCodeSurface
              key={activeFileQuery.data.relativePath}
              contents={activeFileQuery.data.contents}
              language={activeLanguage}
              path={activeFileQuery.data.relativePath}
              theme={resolvedTheme}
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
