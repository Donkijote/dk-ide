import type { EnvironmentId, ProjectEntry } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  ChevronRightIcon,
  FileCode2Icon,
  FolderIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { Kbd, KbdGroup } from "~/components/ui/kbd";
import { useGitStatus } from "~/lib/gitStatusState";
import { cn, isMacPlatform } from "~/lib/utils";
import {
  projectListDirectoryQueryOptions,
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

function dirnameOfPath(path: string): string {
  const normalizedPath = path.replace(/\\/g, "/").replace(/\/+$/g, "");
  const separatorIndex = normalizedPath.lastIndexOf("/");
  return separatorIndex === -1 ? "" : normalizedPath.slice(0, separatorIndex);
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function buildDirectoryTrail(path: string): Array<{ path: string; label: string }> {
  const segments = normalizeRelativePath(path).split("/").filter(Boolean);
  const trail = [{ path: "", label: "Root" }];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) {
      continue;
    }
    trail.push({
      path: segments.slice(0, index + 1).join("/"),
      label: segment,
    });
  }
  return trail;
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to open file.";
}

function firstSearchableFiles(entries: readonly ProjectEntry[]): ProjectEntry[] {
  return entries.filter((entry) => entry.kind === "file").slice(0, SEARCH_LIMIT);
}

type ChangedFile = {
  readonly path: string;
  readonly insertions: number;
  readonly deletions: number;
};

type ChangedPathState = {
  readonly changedFileByPath: ReadonlyMap<string, ChangedFile>;
  readonly changedDirectoryPaths: ReadonlySet<string>;
};

function buildChangedPathState(files: readonly ChangedFile[]): ChangedPathState {
  const changedFileByPath = new Map<string, ChangedFile>();
  const changedDirectoryPaths = new Set<string>();

  for (const file of files) {
    const normalizedPath = normalizeRelativePath(file.path);
    changedFileByPath.set(normalizedPath, { ...file, path: normalizedPath });

    let parentPath = dirnameOfPath(normalizedPath);
    while (parentPath) {
      changedDirectoryPaths.add(parentPath);
      parentPath = dirnameOfPath(parentPath);
    }
  }

  return { changedFileByPath, changedDirectoryPaths };
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

type EditorWorkspaceState = {
  readonly activePath: string | null;
  readonly openPaths: readonly string[];
};

const EMPTY_EDITOR_WORKSPACE_STATE: EditorWorkspaceState = {
  activePath: null,
  openPaths: [],
};

export function WorkspaceEditorPane({
  className,
  environmentId,
  resolvedTheme,
  workspaceRoot,
  onActive,
}: WorkspaceEditorPaneProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorPaneSelectedRef = useRef(false);
  const highlightedFileRef = useRef<HTMLButtonElement | null>(null);
  const breadcrumbScrollRef = useRef<HTMLDivElement | null>(null);
  const searchPopupRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [workspaceStateByKey, setWorkspaceStateByKey] = useState<
    Record<string, EditorWorkspaceState>
  >({});
  const [currentDirectoryPath, setCurrentDirectoryPath] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightedFileIndex, setHighlightedFileIndex] = useState(0);
  const workspaceContextKey =
    workspaceRoot === undefined ? null : `${environmentId}\u0000${workspaceRoot}`;
  const workspaceEditorState =
    workspaceContextKey === null
      ? EMPTY_EDITOR_WORKSPACE_STATE
      : (workspaceStateByKey[workspaceContextKey] ?? EMPTY_EDITOR_WORKSPACE_STATE);
  const activePath = workspaceEditorState.activePath;
  const openPaths = workspaceEditorState.openPaths;
  const trimmedQuery = query.trim();
  const directoryQuery = useQuery(
    projectListDirectoryQueryOptions({
      environmentId,
      cwd: workspaceRoot ?? null,
      relativePath: currentDirectoryPath,
      enabled: workspaceRoot !== undefined,
    }),
  );
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
  const gitStatus = useGitStatus({
    environmentId,
    cwd: workspaceRoot ?? null,
  });
  const changedPathState = useMemo(
    () => buildChangedPathState(gitStatus.data?.workingTree.files ?? []),
    [gitStatus.data?.workingTree.files],
  );
  const currentDirectoryTrail = useMemo(
    () => buildDirectoryTrail(currentDirectoryPath),
    [currentDirectoryPath],
  );
  const currentDirectoryEntries = directoryQuery.data?.entries ?? [];
  const activeLanguage = activePath ? languageForPath(activePath) : "plaintext";
  const activeChangedFile = activePath ? changedPathState.changedFileByPath.get(activePath) : null;
  const useMetaForMod = isMacPlatform(navigator.platform);
  const updateWorkspaceEditorState = useCallback(
    (update: (currentState: EditorWorkspaceState) => EditorWorkspaceState) => {
      if (workspaceContextKey === null) {
        return;
      }

      setWorkspaceStateByKey((currentStateByKey) => {
        const currentState = currentStateByKey[workspaceContextKey] ?? EMPTY_EDITOR_WORKSPACE_STATE;
        const nextState = update(currentState);
        return {
          ...currentStateByKey,
          [workspaceContextKey]: nextState,
        };
      });
    },
    [workspaceContextKey],
  );
  const openPath = useCallback(
    (path: string) => {
      updateWorkspaceEditorState((currentState) => ({
        activePath: path,
        openPaths: currentState.openPaths.includes(path)
          ? currentState.openPaths
          : [...currentState.openPaths, path],
      }));
      setCurrentDirectoryPath(dirnameOfPath(path));
      setQuery("");
      setSearchOpen(false);
      onActive?.();
    },
    [onActive, updateWorkspaceEditorState],
  );
  const openHighlightedPath = useCallback(() => {
    const highlightedFile = files[highlightedFileIndex] ?? files[0];
    if (!highlightedFile) {
      return;
    }
    openPath(highlightedFile.path);
  }, [files, highlightedFileIndex, openPath]);
  const activatePath = useCallback(
    (path: string) => {
      updateWorkspaceEditorState((currentState) => ({
        ...currentState,
        activePath: path,
      }));
      setCurrentDirectoryPath(dirnameOfPath(path));
      onActive?.();
    },
    [onActive, updateWorkspaceEditorState],
  );
  const closePath = useCallback(
    (path: string) => {
      const closedPathIndex = openPaths.indexOf(path);
      const nextOpenPaths = openPaths.filter((openPath) => openPath !== path);
      updateWorkspaceEditorState((currentState) => ({
        activePath:
          currentState.activePath === path
            ? (nextOpenPaths[closedPathIndex] ?? nextOpenPaths[closedPathIndex - 1] ?? null)
            : currentState.activePath,
        openPaths: nextOpenPaths,
      }));
    },
    [openPaths, updateWorkspaceEditorState],
  );
  const navigateDirectory = useCallback(
    (path: string) => {
      setCurrentDirectoryPath(normalizeRelativePath(path));
      onActive?.();
    },
    [onActive],
  );

  useEffect(() => {
    setQuery("");
    setSearchOpen(false);
    setCurrentDirectoryPath("");
    setHighlightedFileIndex(0);
  }, [workspaceContextKey]);

  useEffect(() => {
    setHighlightedFileIndex(0);
  }, [trimmedQuery]);

  useEffect(() => {
    setHighlightedFileIndex((currentIndex) => {
      if (files.length === 0) {
        return 0;
      }
      return Math.min(currentIndex, files.length - 1);
    });
  }, [files.length]);

  useEffect(() => {
    highlightedFileRef.current?.scrollIntoView({ block: "nearest" });
  }, [highlightedFileIndex]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const breadcrumbScroll = breadcrumbScrollRef.current;
      if (!breadcrumbScroll) {
        return;
      }

      breadcrumbScroll.scrollTo({
        left: breadcrumbScroll.scrollWidth,
        behavior: "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [currentDirectoryPath]);

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
        {activeChangedFile ? (
          <div
            className="hidden shrink-0 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-mono text-[0.6875rem] text-amber-700 leading-none dark:text-amber-300 sm:flex"
            title={`Changed lines in ${activeChangedFile.path}: +${activeChangedFile.insertions} -${activeChangedFile.deletions}`}
          >
            <span className="text-success">+{activeChangedFile.insertions}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-destructive">-{activeChangedFile.deletions}</span>
          </div>
        ) : null}
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
          <PopoverPopup
            align="end"
            sideOffset={8}
            className="w-[min(32rem,calc(100vw-2rem))] overflow-hidden rounded-2xl p-0 before:bg-muted/72"
            viewportClassName="p-0! [--viewport-inline-padding:0px]"
          >
            <div ref={searchPopupRef} className="flex max-h-[min(34rem,80vh)] min-w-0 flex-col">
              <div className="relative px-2.5 py-1.5">
                <SearchIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-5 z-10 size-4 text-muted-foreground opacity-80" />
                <Input
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onFocus={onActive}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setSearchOpen(false);
                      return;
                    }
                    if (event.key === "ArrowDown" && files.length > 0) {
                      event.preventDefault();
                      setHighlightedFileIndex((currentIndex) => (currentIndex + 1) % files.length);
                      return;
                    }
                    if (event.key === "ArrowUp" && files.length > 0) {
                      event.preventDefault();
                      setHighlightedFileIndex(
                        (currentIndex) => (currentIndex - 1 + files.length) % files.length,
                      );
                      return;
                    }
                    if (event.key === "Enter" && files.length > 0) {
                      event.preventDefault();
                      openHighlightedPath();
                    }
                  }}
                  placeholder="Search files"
                  disabled={!workspaceRoot}
                  size="lg"
                  className="border-transparent! bg-transparent! shadow-none before:hidden has-focus-visible:ring-0 *:data-[slot=input]:ps-8"
                />
              </div>
              <div className="-mx-px relative min-h-0 overflow-hidden rounded-t-xl border border-b-0 bg-popover bg-clip-padding shadow-xs/5 [clip-path:inset(0_1px)] before:pointer-events-none before:absolute before:inset-0 before:rounded-t-[calc(var(--radius-xl)-1px)]">
                {trimmedQuery.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Type to search files.
                  </div>
                ) : searchEntriesQuery.isLoading || searchEntriesQuery.isFetching ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
                    <LoaderCircleIcon className="size-4 animate-spin" />
                    Searching
                  </div>
                ) : files.length > 0 ? (
                  <div className="max-h-96 min-h-0 overflow-auto scroll-py-2 p-2">
                    <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">
                      Files
                    </div>
                    {files.map((entry, index) => {
                      const isHighlighted = index === highlightedFileIndex;
                      return (
                        <button
                          key={entry.path}
                          ref={isHighlighted ? highlightedFileRef : undefined}
                          type="button"
                          className={cn(
                            "flex min-h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-base outline-none transition-colors hover:bg-accent hover:text-accent-foreground sm:min-h-7 sm:text-sm",
                            isHighlighted && "bg-accent text-accent-foreground",
                          )}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setHighlightedFileIndex(index)}
                          onClick={() => openPath(entry.path)}
                        >
                          <FileCode2Icon className="size-4 shrink-0 text-muted-foreground" />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-foreground text-sm">
                              {basenameOfPath(entry.path)}
                            </span>
                            <span className="truncate text-muted-foreground/70 text-xs">
                              {entry.parentPath ?? ""}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    No files found.
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 rounded-b-[calc(var(--radius-2xl)-1px)] border-t px-5 py-3 text-muted-foreground text-xs">
                <div className="flex items-center gap-3">
                  <KbdGroup className="items-center gap-1.5">
                    <Kbd>{useMetaForMod ? "\u2318 K" : "Ctrl K"}</Kbd>
                    <span className="text-muted-foreground/80">Open</span>
                  </KbdGroup>
                  {files.length > 0 ? (
                    <>
                      <KbdGroup className="items-center gap-1.5">
                        <Kbd>↑ ↓</Kbd>
                        <span className="text-muted-foreground/80">Navigate</span>
                      </KbdGroup>
                      <KbdGroup className="items-center gap-1.5">
                        <Kbd>Enter</Kbd>
                        <span className="text-muted-foreground/80">Open selected</span>
                      </KbdGroup>
                    </>
                  ) : null}
                  <KbdGroup className="items-center gap-1.5">
                    <Kbd>Esc</Kbd>
                    <span className="text-muted-foreground/80">Close</span>
                  </KbdGroup>
                </div>
              </div>
            </div>
          </PopoverPopup>
        </Popover>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 bg-background">
        <aside className="flex w-[38%] min-w-32 max-w-56 shrink-0 flex-col border-border/60 border-r bg-muted/20">
          <div className="flex min-h-10 items-center gap-1.5 border-border/60 border-b px-2">
            <div
              ref={breadcrumbScrollRef}
              className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className="flex w-max min-w-full items-center gap-1 whitespace-nowrap text-muted-foreground text-xs">
                {currentDirectoryTrail.map((item, index) => {
                  const isLast = index === currentDirectoryTrail.length - 1;
                  return (
                    <div key={item.path || "root"} className="flex shrink-0 items-center gap-1">
                      {index > 0 ? <ChevronRightIcon className="size-3 shrink-0" /> : null}
                      <button
                        type="button"
                        className={cn(
                          "shrink-0 rounded-sm px-1 py-0.5 whitespace-nowrap transition hover:bg-accent hover:text-accent-foreground",
                          isLast && "font-medium text-foreground",
                        )}
                        onClick={() => navigateDirectory(item.path)}
                        title={item.path || workspaceRoot}
                        disabled={!workspaceRoot}
                      >
                        {item.label}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1.5">
            {!workspaceRoot ? (
              <div className="px-2 py-8 text-center text-muted-foreground text-xs">
                No workspace root.
              </div>
            ) : directoryQuery.isLoading ? (
              <div className="flex items-center gap-2 px-2 py-3 text-muted-foreground text-xs">
                <LoaderCircleIcon className="size-3.5 animate-spin" />
                Loading files
              </div>
            ) : directoryQuery.isError ? (
              <div className="px-2 py-3 text-destructive text-xs">
                {asErrorMessage(directoryQuery.error)}
              </div>
            ) : currentDirectoryEntries.length > 0 ? (
              <div className="space-y-0.5">
                {currentDirectoryEntries.map((entry) => {
                  const changedFile = changedPathState.changedFileByPath.get(entry.path);
                  const containsChangedFile =
                    entry.kind === "directory" &&
                    changedPathState.changedDirectoryPaths.has(entry.path);
                  const isActiveFile = entry.kind === "file" && entry.path === activePath;
                  const Icon = entry.kind === "directory" ? FolderIcon : FileCode2Icon;

                  return (
                    <button
                      key={entry.path}
                      type="button"
                      className={cn(
                        "group flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                        isActiveFile
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                      title={entry.path}
                      onClick={() => {
                        if (entry.kind === "directory") {
                          navigateDirectory(entry.path);
                        } else {
                          openPath(entry.path);
                        }
                      }}
                    >
                      <Icon
                        className={cn(
                          "size-3.5 shrink-0",
                          entry.kind === "directory" && containsChangedFile && "text-amber-500",
                          entry.kind === "file" && changedFile && "text-amber-500",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {basenameOfPath(entry.path)}
                      </span>
                      {entry.kind === "directory" ? (
                        <ChevronRightIcon className="size-3 shrink-0 opacity-45 transition group-hover:opacity-80" />
                      ) : changedFile ? (
                        <span
                          className="size-1.5 shrink-0 rounded-full bg-amber-500"
                          title={`Changed: +${changedFile.insertions} -${changedFile.deletions}`}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="px-2 py-8 text-center text-muted-foreground text-xs">
                Empty directory.
              </div>
            )}
          </div>
          {directoryQuery.data?.truncated ? (
            <div className="border-border/60 border-t px-3 py-2 text-muted-foreground text-xs">
              Some files are hidden because the workspace index is truncated.
            </div>
          ) : null}
        </aside>

        <div className="relative flex min-h-0 min-w-0 flex-1">
          {!workspaceRoot ? (
            <div className="m-auto max-w-sm px-4 text-center text-muted-foreground text-sm">
              Workspace unavailable
            </div>
          ) : activePath === null ? (
            <div className="m-auto flex max-w-sm flex-col items-center gap-3 px-4 text-center">
              <div className="flex size-10 items-center justify-center rounded-md border border-border/70 bg-muted text-muted-foreground">
                <FolderOpenIcon className="size-5" />
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
    </div>
  );
}
