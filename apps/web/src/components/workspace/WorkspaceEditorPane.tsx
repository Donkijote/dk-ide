import type { EnvironmentId, ProjectEntry } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { AlertCircleIcon, FileCode2Icon, LoaderCircleIcon, SearchIcon, XIcon } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { cn, isMacPlatform } from "~/lib/utils";
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

function isFileSearchShortcut(event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== "k" || event.altKey || event.shiftKey) {
    return false;
  }
  return isMacPlatform(navigator.platform)
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorPaneSelectedRef = useRef(false);
  const searchPopupRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
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
      setOpenPaths((currentPaths) =>
        currentPaths.includes(path) ? currentPaths : [...currentPaths, path],
      );
      setActivePath(path);
      setQuery("");
      setSearchOpen(false);
      onActive?.();
    },
    [onActive],
  );
  const activatePath = useCallback(
    (path: string) => {
      setActivePath(path);
      onActive?.();
    },
    [onActive],
  );
  const closePath = useCallback(
    (path: string) => {
      const closedPathIndex = openPaths.indexOf(path);
      const nextOpenPaths = openPaths.filter((openPath) => openPath !== path);
      setOpenPaths(nextOpenPaths);
      if (activePath === path) {
        setActivePath(nextOpenPaths[closedPathIndex] ?? nextOpenPaths[closedPathIndex - 1] ?? null);
      }
    },
    [activePath, openPaths],
  );

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [searchOpen]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        editorPaneSelectedRef.current = false;
        return;
      }
      editorPaneSelectedRef.current =
        (rootRef.current?.contains(target) ?? false) ||
        (searchPopupRef.current?.contains(target) ?? false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !workspaceRoot || !isFileSearchShortcut(event)) {
        return;
      }

      const activeElement = document.activeElement;
      const isEditorPaneFocused =
        activeElement instanceof HTMLElement &&
        ((rootRef.current !== null && rootRef.current.contains(activeElement)) ||
          (searchPopupRef.current !== null && searchPopupRef.current.contains(activeElement)));
      if (!isEditorPaneFocused && !editorPaneSelectedRef.current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setSearchOpen(true);
      onActive?.();
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onActive, workspaceRoot]);

  return (
    <div
      ref={rootRef}
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col bg-card/30 w-full", className)}
      onFocusCapture={() => onActive?.()}
      onPointerDownCapture={() => {
        editorPaneSelectedRef.current = true;
        onActive?.();
      }}
    >
      <div className="flex min-w-0 items-center gap-2 border-border/60 border-b px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {openPaths.length > 0 ? (
            openPaths.map((path) => {
              const isActive = path === activePath;
              return (
                <div
                  key={path}
                  className={cn(
                    "group flex h-8 max-w-48 min-w-0 shrink-0 items-center gap-1.5 rounded-md border px-2 text-left text-xs transition-colors",
                    isActive
                      ? "border-border bg-background text-foreground shadow-xs"
                      : "border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                  title={path}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5"
                    onClick={() => activatePath(path)}
                  >
                    <FileCode2Icon className="size-3.5 shrink-0" />
                    <span className="min-w-0 truncate font-medium">{basenameOfPath(path)}</span>
                  </button>
                  <button
                    type="button"
                    className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-70 transition hover:bg-muted hover:text-foreground group-hover:opacity-100"
                    aria-label={`Close ${basenameOfPath(path)}`}
                    title={`Close ${basenameOfPath(path)}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      closePath(path);
                    }}
                  >
                    <XIcon className="size-3" />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="min-w-0 truncate text-muted-foreground text-xs">No open files</div>
          )}
        </div>
        <Popover
          open={searchOpen}
          onOpenChange={(open) => {
            setSearchOpen(open);
            if (!open) {
              setQuery("");
            }
          }}
        >
          <PopoverTrigger
            render={
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                disabled={!workspaceRoot}
                aria-label="Search files"
                title="Search files"
                onClick={onActive}
              />
            }
          >
            <SearchIcon className="size-4" />
          </PopoverTrigger>
          <PopoverPopup align="end" sideOffset={8} className="w-[min(28rem,calc(100vw-2rem))] p-0">
            <div ref={searchPopupRef} className="flex min-w-0 flex-col">
              <div className="relative border-border/60 border-b">
                <SearchIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-3.5 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onFocus={onActive}
                  placeholder="Search files"
                  disabled={!workspaceRoot}
                  className="h-10 rounded-none border-0 bg-transparent pl-8 text-sm shadow-none focus-visible:ring-0"
                />
              </div>
              <div className="max-h-72 min-h-0 overflow-auto py-1">
                {trimmedQuery.length === 0 ? (
                  <div className="px-3 py-2 text-muted-foreground text-xs">
                    Type to search files.
                  </div>
                ) : searchEntriesQuery.isLoading || searchEntriesQuery.isFetching ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-muted-foreground text-xs">
                    <LoaderCircleIcon className="size-3.5 animate-spin" />
                    Searching
                  </div>
                ) : files.length > 0 ? (
                  files.map((entry) => (
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
                  ))
                ) : (
                  <div className="px-3 py-2 text-muted-foreground text-xs">No files found</div>
                )}
              </div>
              <div className="border-border/60 border-t px-3 py-2 text-muted-foreground text-[11px]">
                Press {isMacPlatform(navigator.platform) ? "⌘K" : "Ctrl+K"} while the editor is
                focused to search.
              </div>
            </div>
          </PopoverPopup>
        </Popover>
      </div>

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
            <div className="space-y-2">
              <div className="space-y-1">
                <p className="font-medium text-foreground text-sm">No file open</p>
                <p className="text-muted-foreground text-xs">{workspaceRoot}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchOpen(true);
                  onActive?.();
                }}
                className="h-8"
              >
                <SearchIcon className="size-3.5" />
                Search files
              </Button>
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
