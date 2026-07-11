import {
  type ApprovalRequestId,
  DEFAULT_MODEL,
  defaultInstanceIdForDriver,
  type EnvironmentId,
  type MessageId,
  type ModelSelection,
  type ProjectScript,
  type ProjectId,
  type ProviderApprovalDecision,
  ProviderInstanceId,
  type ServerProvider,
  type ResolvedKeybindingsConfig,
  type ScopedThreadRef,
  ThreadId,
  type TurnId,
  type KeybindingCommand,
  OrchestrationThreadActivity,
  ProviderInteractionMode,
  ProviderDriverKind,
  RuntimeMode,
  TerminalOpenInput,
} from "@t3tools/contracts";
import {
  parseScopedThreadKey,
  scopedProjectKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/legacy";
import {
  applyClaudePromptEffortPrefix,
  createModelSelection,
  resolvePromptInjectedEffort,
} from "@t3tools/shared/model";
import { projectScriptCwd, projectScriptRuntimeEnv } from "@t3tools/shared/projectScripts";
import { truncate } from "@t3tools/shared/String";
import { useQuery } from "@tanstack/react-query";
import { Debouncer } from "@tanstack/react-pacer";
import { type ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useShallow } from "zustand/react/shallow";
import { useVcsStatus } from "~/lib/vcsStatusState";
import { usePrimaryEnvironmentId } from "../environments/primary";
import { readEnvironmentApi } from "../environmentApi";
import { isElectron } from "../env";
import { readLocalApi } from "../localApi";
import { parseDiffRouteSearch, stripDiffSearchParams } from "../diffRouteSearch";
import {
  collapseExpandedComposerCursor,
  parseStandaloneComposerSlashCommand,
} from "../composer-logic";
import {
  deriveCompletionDividerBeforeEntryId,
  derivePendingApprovals,
  derivePendingUserInputs,
  derivePhase,
  deriveTimelineEntries,
  deriveActiveWorkStartedAt,
  deriveActivePlanState,
  findSidebarProposedPlan,
  findLatestProposedPlan,
  deriveWorkLogEntries,
  hasActionableProposedPlan,
  hasToolActivityForTurn,
  isLatestTurnSettled,
  formatElapsed,
} from "../session-logic";
import { type LegendListRef } from "@legendapp/list/react";
import {
  buildPendingUserInputAnswers,
  derivePendingUserInputProgress,
  setPendingUserInputCustomAnswer,
  togglePendingUserInputOptionSelection,
  type PendingUserInputDraftAnswer,
} from "../pendingUserInput";
import {
  selectProjectsAcrossEnvironments,
  selectSidebarThreadsForProjectRefs,
  selectThreadsAcrossEnvironments,
  useStore,
} from "../store";
import { createProjectSelectorByRef, createThreadSelectorByRef } from "../storeSelectors";
import {
  type PersistedWorkspaceDockedPane,
  type WorkspaceDockedPaneType,
  type WorkspaceDockedPaneWidthPreset,
  useUiStateStore,
} from "../uiStateStore";
import {
  buildPlanImplementationThreadTitle,
  buildPlanImplementationPrompt,
  resolvePlanFollowUpSubmission,
} from "../proposedPlan";
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  DEFAULT_THREAD_TERMINAL_ID,
  MAX_TERMINALS_PER_GROUP,
  type ChatMessage,
  type SessionPhase,
  type Thread,
  type ThreadTerminalGroup,
  type TurnDiffSummary,
} from "../types";
import { useTheme } from "../hooks/useTheme";
import { useTurnDiffSummaries } from "../hooks/useTurnDiffSummaries";
import { useCommandPaletteStore } from "../commandPaletteStore";
import { buildTemporaryWorktreeBranchName } from "@t3tools/shared/git";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useThreadActions } from "../hooks/useThreadActions";
import { RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY } from "../rightPanelLayout";
import { BranchToolbar } from "./BranchToolbar";
import { resolveShortcutCommand, shortcutLabelForCommand } from "../keybindings";
import {
  resolveSidebarNewThreadEnvMode,
  resolveSidebarNewThreadSeedContext,
} from "./Sidebar.logic";
import PlanSidebar from "./PlanSidebar";
import ThreadTerminalDrawer from "./ThreadTerminalDrawer";
import {
  BotIcon,
  ChevronDownIcon,
  Columns2Icon,
  CornerLeftUpIcon,
  DiffIcon,
  FileCode2Icon,
  FolderIcon,
  Maximize2Icon,
  PlusIcon,
  RectangleHorizontalIcon,
  RectangleVerticalIcon,
  SquarePenIcon,
  TerminalIcon,
  TerminalSquareIcon,
  Trash2Icon,
  TriangleAlertIcon,
  type LucideIcon,
  WifiOffIcon,
  XIcon,
} from "lucide-react";
import { cn, randomHex, randomUUID } from "~/lib/utils";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { decodeProjectScriptKeybindingRule } from "~/lib/projectScriptKeybindings";
import { type NewProjectScriptInput } from "./ProjectScriptsControl";
import {
  commandForProjectScript,
  nextProjectScriptId,
  projectScriptIdFromCommand,
} from "~/projectScripts";
import { newCommandId, newDraftId, newMessageId, newThreadId } from "~/lib/utils";
import { getProviderModelCapabilities, resolveSelectableProvider } from "../providerModels";
import { useSettings } from "../hooks/useSettings";
import {
  getAppModelOptionConfigForProvider,
  resolveAppModelSelectionForInstance,
} from "../modelSelection";
import { isTerminalFocused } from "../lib/terminalFocus";
import { renameThreadTitle } from "../lib/threadTitleRename";
import { providerRuntimeStatusQueryOptions } from "~/lib/providerReactQuery";
import {
  deriveLogicalProjectKeyFromSettings,
  selectProjectGroupingSettings,
} from "../logicalProject";
import {
  reconnectSavedEnvironment,
  useSavedEnvironmentRegistryStore,
  useSavedEnvironmentRuntimeStore,
} from "../environments/runtime";
import { buildDraftThreadRouteParams, buildThreadRouteParams } from "../threadRoutes";
import {
  type ComposerImageAttachment,
  DraftId,
  type DraftThreadEnvMode,
  useComposerDraftStore,
} from "../composerDraftStore";
import {
  appendTerminalContextsToPrompt,
  formatTerminalContextLabel,
  type TerminalContextDraft,
  type TerminalContextSelection,
} from "../lib/terminalContext";
import { useThreadRunningTerminalIds } from "../terminalSessionState";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { ChatComposer, type ChatComposerHandle } from "./chat/ChatComposer";
import { ExpandedImageDialog } from "./chat/ExpandedImageDialog";
import { PullRequestThreadDialog } from "./PullRequestThreadDialog";
import { MessagesTimeline } from "./chat/MessagesTimeline";
import { ChatHeader } from "./chat/ChatHeader";
import { type ExpandedImagePreview } from "./chat/ExpandedImagePreview";
import { NoActiveThreadState } from "./NoActiveThreadState";
import { resolveEffectiveEnvMode, resolveEnvironmentOptionLabel } from "./BranchToolbar.logic";
import { ProviderStatusBanner } from "./chat/ProviderStatusBanner";
import { ThreadErrorBanner } from "./chat/ThreadErrorBanner";
import { ComposerBannerStack, type ComposerBannerStackItem } from "./chat/ComposerBannerStack";
import {
  WorkspaceEditorPane,
  type EditorWorkspaceStateChange,
  type WorkspaceEditorOpenFileRequest,
} from "./workspace/WorkspaceEditorPane";
import { WorkspaceEditorActions } from "./workspace/WorkspaceEditorActions";
import { WorkspacePane } from "./workspace/WorkspacePane";
import { WorkspacePaneHost } from "./workspace/WorkspacePaneHost";
import { TerminalPaneHeaderActions, TerminalPanePath } from "./workspace/TerminalPaneHeader";
import {
  MAX_HIDDEN_MOUNTED_TERMINAL_THREADS,
  applyWorkspaceEditorPaneState,
  basenameOfPanePath,
  buildExpiredTerminalContextToastCopy,
  buildLocalDraftThread,
  collectUserMessageBlobPreviewUrls,
  createLocalDispatchSnapshot,
  deriveComposerSendState,
  hasServerAcknowledgedLocalDispatch,
  LAST_INVOKED_SCRIPT_BY_PROJECT_KEY,
  LastInvokedScriptByProjectSchema,
  type LocalDispatchSnapshot,
  PullRequestDialogState,
  cloneComposerImageForRetry,
  deriveLockedProvider,
  readFileAsDataUrl,
  reconcileMountedTerminalThreadIds,
  resolveEditorPaneDefaultTitle,
  resolveSendEnvMode,
  revokeBlobPreviewUrl,
  revokeUserMessagePreviewUrls,
  sanitizeUnavailableWorkspacePaneThreads,
  shouldRemoveTerminalPaneAfterClose,
  shouldWriteThreadErrorToCurrentServerThread,
  waitForStartedServerThread,
  workspacePaneLayoutKey,
} from "./ChatView.logic";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { useComposerHandleContext } from "../composerHandleContext";
import {
  useServerAvailableEditors,
  useServerConfig,
  useServerKeybindings,
} from "~/rpc/serverState";
import { sanitizeThreadErrorMessage } from "~/rpc/transportError";
import { retainThreadDetailSubscription } from "../environments/runtime/service";
import { RightPanelSheet } from "./RightPanelSheet";
import {
  mergeVisibleWorkspacePaneUpdates,
  setWorkspacePaneWidthPreset,
  WORKSPACE_PANE_WIDTH_PRESETS,
  workspacePaneWidthPreset,
  workspaceTerminalRowHeight,
} from "../workspacePaneLayout";
import { Button, buttonVariants } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Select, SelectItem, SelectPopup, SelectTrigger } from "./ui/select";
import { Popover, PopoverClose, PopoverPopup, PopoverTrigger } from "./ui/popover";
import { useSidebar } from "./ui/sidebar";
import { Toggle } from "./ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { resolveThreadStatusPill } from "./Sidebar.logic";
import { ThreadStatusLabel } from "./ThreadStatusIndicators";
import {
  appendBrowsePathSegment,
  canNavigateUp,
  ensureBrowseDirectoryPath,
  getBrowseDirectoryPath,
  getBrowseLeafPathSegment,
  getBrowseParentPath,
  hasTrailingPathSeparator,
  isExplicitRelativeProjectPath,
  resolveProjectPathForDispatch,
} from "../lib/projectPaths";
import { filterBrowseEntries } from "./CommandPalette.logic";
import {
  buildVersionMismatchDismissalKey,
  dismissVersionMismatch,
  isVersionMismatchDismissed,
  resolveServerConfigVersionMismatch,
} from "../versionSkew";

const IMAGE_ONLY_BOOTSTRAP_PROMPT =
  "[User attached one or more images without additional text. Respond using the conversation context and the attached image(s).]";
const EMPTY_ACTIVITIES: OrchestrationThreadActivity[] = [];
const EMPTY_PROPOSED_PLANS: Thread["proposedPlans"] = [];
const EMPTY_PROVIDERS: ServerProvider[] = [];
const EMPTY_PANE_TITLE_OVERRIDES: Record<string, string> = {};
const EMPTY_WORKSPACE_DOCKED_PANES: PersistedWorkspaceDockedPane[] = [];
const EMPTY_WORKSPACE_EDITOR_OPEN_PATHS: readonly string[] = [];
const EMPTY_TERMINAL_RUNTIME_ENV: Record<string, string> = {};
const EMPTY_PROVIDER_SKILLS: ServerProvider["skills"] = [];
const EMPTY_PENDING_USER_INPUT_ANSWERS: Record<string, PendingUserInputDraftAnswer> = {};

function resolvePaneDefaultTitle(
  type: WorkspaceDockedPaneType,
  cwd: string | null | undefined,
  workspaceName: string | null,
): string {
  const cwdName = basenameOfPanePath(cwd);
  if (type === "ai") {
    return cwdName ?? workspaceName ?? "AI";
  }
  if (type === "terminal") {
    return cwdName ? `${cwdName} Terminal` : "Terminal";
  }
  return cwdName ? `${cwdName} Editor` : "Editor";
}

function paneTypeIcon(type: WorkspaceDockedPaneType, className: string) {
  if (type === "ai") return <BotIcon className={className} />;
  if (type === "terminal") return <TerminalSquareIcon className={className} />;
  return <FileCode2Icon className={className} />;
}

type WorkspacePaneDirectoryTarget = "current" | "other";

interface AddWorkspacePaneDialogProps {
  environmentId: EnvironmentId;
  currentWorkspaceRoot: string | undefined;
  open: boolean;
  workspaceName: string | null;
  onCreate: (input: {
    type: WorkspaceDockedPaneType;
    environmentId: EnvironmentId;
    cwd: string;
    title: string;
  }) => void;
  onOpenChange: (open: boolean) => void;
}

const WORKSPACE_PANE_TYPE_OPTIONS = [
  { type: "ai", label: "AI" },
  { type: "terminal", label: "Terminal" },
  { type: "editor", label: "Editor" },
] as const satisfies ReadonlyArray<{ type: WorkspaceDockedPaneType; label: string }>;

function AddWorkspacePaneDialog({
  environmentId,
  currentWorkspaceRoot,
  open,
  workspaceName,
  onCreate,
  onOpenChange,
}: AddWorkspacePaneDialogProps) {
  const [paneType, setPaneType] = useState<WorkspaceDockedPaneType>("ai");
  const [directoryTarget, setDirectoryTarget] = useState<WorkspacePaneDirectoryTarget>("current");
  const [browseQuery, setBrowseQuery] = useState(() =>
    ensureBrowseDirectoryPath(currentWorkspaceRoot ?? "~/"),
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setPaneType("ai");
    setDirectoryTarget("current");
    setBrowseQuery(ensureBrowseDirectoryPath(currentWorkspaceRoot ?? "~/"));
  }, [currentWorkspaceRoot, open]);

  const relativePathNeedsActiveWorkspace =
    directoryTarget === "other" &&
    isExplicitRelativeProjectPath(browseQuery.trim()) &&
    !currentWorkspaceRoot;
  const browseDirectoryPath = getBrowseDirectoryPath(browseQuery);
  const browseFilterQuery = hasTrailingPathSeparator(browseQuery)
    ? ""
    : getBrowseLeafPathSegment(browseQuery);

  const browseQueryResult = useQuery({
    queryKey: [
      "workspacePaneFilesystemBrowse",
      environmentId,
      browseDirectoryPath,
      currentWorkspaceRoot ?? null,
    ],
    queryFn: async () => {
      const api = readEnvironmentApi(environmentId);
      if (!api) return null;
      return api.filesystem.browse({
        partialPath: browseDirectoryPath,
        ...(currentWorkspaceRoot ? { cwd: currentWorkspaceRoot } : {}),
      });
    },
    staleTime: 5_000,
    enabled:
      open &&
      directoryTarget === "other" &&
      browseDirectoryPath.length > 0 &&
      !relativePathNeedsActiveWorkspace,
  });

  const { filteredEntries, exactEntry } = useMemo(
    () =>
      filterBrowseEntries({
        browseEntries: browseQueryResult.data?.entries ?? [],
        browseFilterQuery,
        highlightedItemValue: null,
      }),
    [browseFilterQuery, browseQueryResult.data?.entries],
  );
  const canBrowseUp =
    directoryTarget === "other" &&
    !relativePathNeedsActiveWorkspace &&
    canNavigateUp(browseDirectoryPath);

  const resolveSelectedCwd = useCallback(() => {
    if (directoryTarget === "current") {
      return currentWorkspaceRoot ?? "";
    }
    const rawPath = hasTrailingPathSeparator(browseQuery)
      ? (browseQueryResult.data?.parentPath ?? browseQuery.trim())
      : (exactEntry?.fullPath ?? browseQuery.trim());
    return resolveProjectPathForDispatch(rawPath, currentWorkspaceRoot ?? null);
  }, [
    browseQuery,
    browseQueryResult.data?.parentPath,
    currentWorkspaceRoot,
    directoryTarget,
    exactEntry?.fullPath,
  ]);

  const selectedCwd = resolveSelectedCwd();
  const canCreate = selectedCwd.length > 0 && !relativePathNeedsActiveWorkspace;

  const browseTo = useCallback(
    (name: string) => {
      setBrowseQuery(appendBrowsePathSegment(browseQuery, name));
    },
    [browseQuery],
  );

  const browseUp = useCallback(() => {
    const parentPath = getBrowseParentPath(browseQuery);
    if (parentPath) {
      setBrowseQuery(parentPath);
    }
  }, [browseQuery]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Pane</DialogTitle>
          <DialogDescription>Create a workspace pane for the selected directory.</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            {WORKSPACE_PANE_TYPE_OPTIONS.map((option) => (
              <button
                key={option.type}
                type="button"
                className={cn(
                  "flex h-20 min-w-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border px-3 text-sm outline-none transition-[background-color,border-color,box-shadow]",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  paneType === option.type
                    ? "border-primary/70 bg-primary/10 text-foreground ring-1 ring-primary/25"
                    : "border-border/70 text-muted-foreground hover:border-foreground/20 hover:bg-muted/50 hover:text-foreground",
                )}
                onClick={() => setPaneType(option.type)}
              >
                {paneTypeIcon(option.type, "size-4")}
                <span className="truncate font-medium">{option.label}</span>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className={cn(
                  "flex min-h-16 min-w-0 cursor-pointer items-center gap-3 rounded-lg border px-3 text-left outline-none transition-[background-color,border-color,box-shadow]",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  directoryTarget === "current"
                    ? "border-primary/70 bg-primary/10 ring-1 ring-primary/25"
                    : "border-border/70 hover:border-foreground/20 hover:bg-muted/50",
                )}
                onClick={() => setDirectoryTarget("current")}
              >
                <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-sm">Current workspace</span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {currentWorkspaceRoot ?? "No workspace"}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  "flex min-h-16 min-w-0 cursor-pointer items-center gap-3 rounded-lg border px-3 text-left outline-none transition-[background-color,border-color,box-shadow]",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  directoryTarget === "other"
                    ? "border-primary/70 bg-primary/10 ring-1 ring-primary/25"
                    : "border-border/70 hover:border-foreground/20 hover:bg-muted/50",
                )}
                onClick={() => setDirectoryTarget("other")}
              >
                <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-sm">Another directory</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    Browse without adding a workspace
                  </span>
                </span>
              </button>
            </div>

            {directoryTarget === "other" ? (
              <div className="rounded-lg border border-border/70">
                <div className="border-b border-border/60 p-2">
                  <input
                    value={browseQuery}
                    onChange={(event) => setBrowseQuery(event.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-xs outline-none transition-colors focus:border-ring"
                    aria-label="Pane directory"
                  />
                </div>
                <div className="max-h-64 overflow-auto p-1.5">
                  {relativePathNeedsActiveWorkspace ? (
                    <p className="px-2 py-4 text-center text-muted-foreground text-xs">
                      Relative paths require an active workspace.
                    </p>
                  ) : browseQueryResult.isLoading ? (
                    <p className="px-2 py-4 text-center text-muted-foreground text-xs">
                      Loading directories...
                    </p>
                  ) : browseQueryResult.isError ? (
                    <p className="px-2 py-4 text-center text-destructive text-xs">
                      Failed to browse directory.
                    </p>
                  ) : (
                    <>
                      {canBrowseUp ? (
                        <button
                          type="button"
                          className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent"
                          onClick={browseUp}
                        >
                          <CornerLeftUpIcon className="size-3.5 text-muted-foreground" />
                          <span className="truncate">..</span>
                        </button>
                      ) : null}
                      {filteredEntries.map((entry) => (
                        <button
                          key={entry.fullPath}
                          type="button"
                          className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent"
                          onClick={() => browseTo(entry.name)}
                        >
                          <FolderIcon className="size-3.5 text-muted-foreground" />
                          <span className="truncate">{entry.name}</span>
                        </button>
                      ))}
                      {filteredEntries.length === 0 && !canBrowseUp ? (
                        <p className="px-2 py-4 text-center text-muted-foreground text-xs">
                          No matching directories.
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canCreate}
            onClick={() => {
              if (!canCreate) return;
              onCreate({
                type: paneType,
                environmentId,
                cwd: selectedCwd,
                title: resolvePaneDefaultTitle(paneType, selectedCwd, workspaceName),
              });
              onOpenChange(false);
            }}
          >
            Add Pane
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

type EnvironmentUnavailableState = {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly connectionState: "connecting" | "disconnected" | "error";
};

type ThreadPlanCatalogEntry = Pick<Thread, "id" | "proposedPlans">;

interface WorkspaceHeaderPaneActionsProps {
  diffOpen: boolean;
  diffToggleShortcutLabel: string | null;
  isGitRepo: boolean;
  runningTerminalThreadRefs: readonly WorkspaceRunningTerminalThreadRef[];
  onAddPane: () => void;
  onToggleDiff: () => void;
}

interface WorkspaceRunningTerminalThreadRef {
  readonly key: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

interface WorkspaceTerminalRunningProbeProps {
  readonly threadRef: WorkspaceRunningTerminalThreadRef;
  readonly onRunningCountChange: (threadKey: string, count: number) => void;
}

const WorkspaceTerminalRunningProbe = memo(function WorkspaceTerminalRunningProbe({
  threadRef,
  onRunningCountChange,
}: WorkspaceTerminalRunningProbeProps) {
  const runningTerminalIds = useThreadRunningTerminalIds({
    environmentId: threadRef.environmentId,
    threadId: threadRef.threadId,
  });

  useEffect(() => {
    onRunningCountChange(threadRef.key, runningTerminalIds.length);
  }, [onRunningCountChange, runningTerminalIds.length, threadRef.key]);

  return null;
});

const WorkspaceRunningTerminalIndicator = memo(function WorkspaceRunningTerminalIndicator({
  threadRefs,
}: {
  readonly threadRefs: readonly WorkspaceRunningTerminalThreadRef[];
}) {
  const [runningCountByThreadKey, setRunningCountByThreadKey] = useState<Record<string, number>>(
    {},
  );
  const handleRunningCountChange = useCallback((threadKey: string, count: number) => {
    setRunningCountByThreadKey((previous) => {
      if (previous[threadKey] === count) {
        return previous;
      }
      const next = { ...previous };
      if (count > 0) {
        next[threadKey] = count;
      } else {
        delete next[threadKey];
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const activeThreadKeys = new Set(threadRefs.map((threadRef) => threadRef.key));
    setRunningCountByThreadKey((previous) => {
      const next = { ...previous };
      let changed = false;
      for (const threadKey of Object.keys(next)) {
        if (!activeThreadKeys.has(threadKey)) {
          delete next[threadKey];
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [threadRefs]);

  const runningTerminalCount = Object.values(runningCountByThreadKey).reduce(
    (total, count) => total + count,
    0,
  );

  return (
    <>
      {threadRefs.map((threadRef) => (
        <WorkspaceTerminalRunningProbe
          key={threadRef.key}
          threadRef={threadRef}
          onRunningCountChange={handleRunningCountChange}
        />
      ))}
      {runningTerminalCount > 0 ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                role="img"
                aria-label="Terminal process running"
                title="Terminal process running"
                data-testid="workspace-terminal-running-indicator"
                className={cn(
                  buttonVariants({ variant: "outline", size: "icon-xs" }),
                  "cursor-default text-teal-600 dark:text-teal-300/90",
                )}
              >
                <TerminalIcon className="size-3.5 animate-pulse" />
              </span>
            }
          />
          <TooltipPopup side="bottom">
            {runningTerminalCount === 1
              ? "Terminal process running"
              : `${runningTerminalCount} terminal processes running`}
          </TooltipPopup>
        </Tooltip>
      ) : null}
    </>
  );
});

const WorkspaceHeaderPaneActions = memo(function WorkspaceHeaderPaneActions({
  diffOpen,
  diffToggleShortcutLabel,
  isGitRepo,
  runningTerminalThreadRefs,
  onAddPane,
  onToggleDiff,
}: WorkspaceHeaderPaneActionsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              className="shrink-0"
              variant="outline"
              size="icon-xs"
              onClick={onAddPane}
              aria-label="Add pane"
            >
              <PlusIcon />
            </Button>
          }
        />
        <TooltipPopup side="bottom">Add pane</TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              className="shrink-0"
              pressed={diffOpen}
              onPressedChange={onToggleDiff}
              aria-label="Toggle diff panel"
              variant="outline"
              size="xs"
              disabled={!isGitRepo && !diffOpen}
            >
              <DiffIcon className="size-3" />
            </Toggle>
          }
        />
        <TooltipPopup side="bottom">
          {!isGitRepo && !diffOpen
            ? "Diff panel is unavailable because this workspace is not a git repository."
            : diffToggleShortcutLabel
              ? `Toggle diff panel (${diffToggleShortcutLabel})`
              : "Toggle diff panel"}
        </TooltipPopup>
      </Tooltip>
      <WorkspaceRunningTerminalIndicator threadRefs={runningTerminalThreadRefs} />
    </div>
  );
});

function useThreadPlanCatalog(threadIds: readonly ThreadId[]): ThreadPlanCatalogEntry[] {
  return useStore(
    useMemo(() => {
      let previousThreadIds: readonly ThreadId[] = [];
      let previousResult: ThreadPlanCatalogEntry[] = [];
      let previousEntries = new Map<
        ThreadId,
        {
          shell: object | null;
          proposedPlanIds: readonly string[] | undefined;
          proposedPlansById: Record<string, Thread["proposedPlans"][number]> | undefined;
          entry: ThreadPlanCatalogEntry;
        }
      >();

      return (state) => {
        const sameThreadIds =
          previousThreadIds.length === threadIds.length &&
          previousThreadIds.every((id, index) => id === threadIds[index]);
        const nextEntries = new Map<
          ThreadId,
          {
            shell: object | null;
            proposedPlanIds: readonly string[] | undefined;
            proposedPlansById: Record<string, Thread["proposedPlans"][number]> | undefined;
            entry: ThreadPlanCatalogEntry;
          }
        >();
        const nextResult: ThreadPlanCatalogEntry[] = [];
        let changed = !sameThreadIds;

        for (const threadId of threadIds) {
          let shell: object | undefined;
          let proposedPlanIds: readonly string[] | undefined;
          let proposedPlansById: Record<string, Thread["proposedPlans"][number]> | undefined;

          for (const environmentState of Object.values(state.environmentStateById)) {
            const matchedShell = environmentState.threadShellById[threadId];
            if (!matchedShell) {
              continue;
            }
            shell = matchedShell;
            proposedPlanIds = environmentState.proposedPlanIdsByThreadId[threadId];
            proposedPlansById = environmentState.proposedPlanByThreadId[threadId] as
              | Record<string, Thread["proposedPlans"][number]>
              | undefined;
            break;
          }

          if (!shell) {
            const previous = previousEntries.get(threadId);
            if (
              previous &&
              previous.shell === null &&
              previous.proposedPlanIds === undefined &&
              previous.proposedPlansById === undefined
            ) {
              nextEntries.set(threadId, previous);
              continue;
            }
            changed = true;
            nextEntries.set(threadId, {
              shell: null,
              proposedPlanIds: undefined,
              proposedPlansById: undefined,
              entry: { id: threadId, proposedPlans: EMPTY_PROPOSED_PLANS },
            });
            continue;
          }

          const previous = previousEntries.get(threadId);
          if (
            previous &&
            previous.shell === shell &&
            previous.proposedPlanIds === proposedPlanIds &&
            previous.proposedPlansById === proposedPlansById
          ) {
            nextEntries.set(threadId, previous);
            nextResult.push(previous.entry);
            continue;
          }

          changed = true;
          const proposedPlans =
            proposedPlanIds && proposedPlanIds.length > 0 && proposedPlansById
              ? proposedPlanIds.flatMap((planId) => {
                  const proposedPlan = proposedPlansById?.[planId];
                  return proposedPlan ? [proposedPlan] : [];
                })
              : EMPTY_PROPOSED_PLANS;
          const entry = { id: threadId, proposedPlans };
          nextEntries.set(threadId, {
            shell,
            proposedPlanIds,
            proposedPlansById,
            entry,
          });
          nextResult.push(entry);
        }

        if (!changed && previousResult.length === nextResult.length) {
          return previousResult;
        }

        previousThreadIds = threadIds;
        previousEntries = nextEntries;
        previousResult = nextResult;
        return nextResult;
      };
    }, [threadIds]),
  );
}

function formatOutgoingPrompt(params: {
  provider: ProviderDriverKind;
  model: string | null;
  models: ReadonlyArray<ServerProvider["models"][number]>;
  effort: string | null;
  text: string;
}): string {
  const caps = getProviderModelCapabilities(params.models, params.model, params.provider);
  const promptEffort = resolvePromptInjectedEffort(caps, params.effort);
  return applyClaudePromptEffortPrefix(params.text, promptEffort);
}
const SCRIPT_TERMINAL_COLS = 120;
const SCRIPT_TERMINAL_ROWS = 30;

function workspacePaneWidthPresetIcon(widthPreset: WorkspaceDockedPaneWidthPreset): LucideIcon {
  switch (widthPreset) {
    case "narrow":
      return RectangleVerticalIcon;
    case "medium":
      return Columns2Icon;
    case "wide":
      return Maximize2Icon;
    case "large":
    default:
      return RectangleHorizontalIcon;
  }
}

function workspacePaneWidthPresetLabel(widthPreset: WorkspaceDockedPaneWidthPreset): string {
  switch (widthPreset) {
    case "narrow":
      return "Small";
    case "wide":
      return "Full";
    case "medium":
      return "Medium";
    case "large":
      return "Large";
  }
}

type AiPaneDraftOrigin = {
  threadRef: ScopedThreadRef;
  title: string;
  route:
    | { kind: "server" }
    | {
        kind: "draft";
        draftId: DraftId;
      };
};

const aiPaneDraftOrigins = new Map<DraftId, AiPaneDraftOrigin>();

type ChatViewProps =
  | {
      environmentId: EnvironmentId;
      threadId: ThreadId;
      onDiffPanelOpen?: () => void;
      embeddedPaneActions?: ReactNode;
      embeddedPaneActive?: boolean;
      embeddedPaneLeadingActions?: ReactNode;
      onWorkspaceAiPaneThreadChange?: (
        nextThreadKey: string | null,
        options?: { title?: string },
      ) => void;
      reserveTitleBarControlInset?: boolean;
      routeKind: "server";
      workspaceMode?: "full" | "ai-pane";
      draftId?: never;
    }
  | {
      environmentId: EnvironmentId;
      threadId: ThreadId;
      onDiffPanelOpen?: () => void;
      embeddedPaneActions?: ReactNode;
      embeddedPaneActive?: boolean;
      embeddedPaneLeadingActions?: ReactNode;
      onWorkspaceAiPaneThreadChange?: (
        nextThreadKey: string | null,
        options?: { title?: string },
      ) => void;
      reserveTitleBarControlInset?: boolean;
      routeKind: "draft";
      workspaceMode?: "full" | "ai-pane";
      draftId: DraftId;
    };

interface TerminalLaunchContext {
  threadId: ThreadId;
  cwd: string;
  worktreePath: string | null;
}

type PersistentTerminalLaunchContext = Pick<TerminalLaunchContext, "cwd" | "worktreePath">;

function useLocalDispatchState(input: {
  activeThread: Thread | undefined;
  activeLatestTurn: Thread["latestTurn"] | null;
  phase: SessionPhase;
  activePendingApproval: ApprovalRequestId | null;
  activePendingUserInput: ApprovalRequestId | null;
  threadError: string | null | undefined;
}) {
  const [localDispatch, setLocalDispatch] = useState<LocalDispatchSnapshot | null>(null);

  const beginLocalDispatch = useCallback(
    (options?: { preparingWorktree?: boolean }) => {
      const preparingWorktree = Boolean(options?.preparingWorktree);
      setLocalDispatch((current) => {
        if (current) {
          return current.preparingWorktree === preparingWorktree
            ? current
            : { ...current, preparingWorktree };
        }
        return createLocalDispatchSnapshot(input.activeThread, options);
      });
    },
    [input.activeThread],
  );

  const resetLocalDispatch = useCallback(() => {
    setLocalDispatch(null);
  }, []);

  const serverAcknowledgedLocalDispatch = useMemo(
    () =>
      hasServerAcknowledgedLocalDispatch({
        localDispatch,
        phase: input.phase,
        latestTurn: input.activeLatestTurn,
        session: input.activeThread?.session ?? null,
        hasPendingApproval: input.activePendingApproval !== null,
        hasPendingUserInput: input.activePendingUserInput !== null,
        threadError: input.threadError,
      }),
    [
      input.activeLatestTurn,
      input.activePendingApproval,
      input.activePendingUserInput,
      input.activeThread?.session,
      input.phase,
      input.threadError,
      localDispatch,
    ],
  );

  useEffect(() => {
    if (!serverAcknowledgedLocalDispatch) {
      return;
    }
    resetLocalDispatch();
  }, [resetLocalDispatch, serverAcknowledgedLocalDispatch]);

  return {
    beginLocalDispatch,
    resetLocalDispatch,
    localDispatchStartedAt: localDispatch?.startedAt ?? null,
    isPreparingWorktree: localDispatch?.preparingWorktree ?? false,
    isSendBusy: localDispatch !== null && !serverAcknowledgedLocalDispatch,
  };
}

interface PersistentThreadTerminalPaneDeckProps {
  threadRef: { environmentId: EnvironmentId; threadId: ThreadId };
  threadId: ThreadId;
  visible: boolean;
  launchContext: PersistentTerminalLaunchContext | null;
  focusRequestId: number;
  splitShortcutLabel: string | undefined;
  newShortcutLabel: string | undefined;
  closeShortcutLabel: string | undefined;
  keybindings: ResolvedKeybindingsConfig;
  onAddTerminalContext: (selection: TerminalContextSelection) => void;
}

const PersistentThreadTerminalPaneDeck = memo(function PersistentThreadTerminalPaneDeck({
  threadRef,
  threadId,
  visible,
  launchContext,
  focusRequestId,
  splitShortcutLabel,
  newShortcutLabel,
  closeShortcutLabel,
  keybindings,
  onAddTerminalContext,
}: PersistentThreadTerminalPaneDeckProps) {
  const serverThread = useStore(useMemo(() => createThreadSelectorByRef(threadRef), [threadRef]));
  const draftThread = useComposerDraftStore((store) => store.getDraftThreadByRef(threadRef));
  const threadKey = useMemo(() => scopedThreadKey(threadRef), [threadRef]);
  const projectRef = serverThread
    ? scopeProjectRef(serverThread.environmentId, serverThread.projectId)
    : draftThread
      ? scopeProjectRef(draftThread.environmentId, draftThread.projectId)
      : null;
  const project = useStore(useMemo(() => createProjectSelectorByRef(projectRef), [projectRef]));
  const terminalState = useTerminalUiStateStore((state) =>
    selectThreadTerminalUiState(state.terminalUiStateByThreadKey, threadRef),
  );
  const storeSetWorkspaceThreadLastActivePane = useUiStateStore(
    (state) => state.setWorkspaceThreadLastActivePane,
  );
  const paneTitleOverrideById = useUiStateStore(
    (state) =>
      state.workspaceThreadLayoutById[threadKey]?.paneTitleOverrideById ??
      EMPTY_PANE_TITLE_OVERRIDES,
  );
  const storeSetWorkspaceThreadPaneTitleOverride = useUiStateStore(
    (state) => state.setWorkspaceThreadPaneTitleOverride,
  );
  const storeSetTerminalHeight = useTerminalUiStateStore((state) => state.setTerminalHeight);
  const storeSplitTerminal = useTerminalUiStateStore((state) => state.splitTerminal);
  const storeNewTerminal = useTerminalUiStateStore((state) => state.newTerminal);
  const storeSetActiveTerminal = useTerminalUiStateStore((state) => state.setActiveTerminal);
  const storeCloseTerminal = useTerminalUiStateStore((state) => state.closeTerminal);
  const [localFocusRequestId, setLocalFocusRequestId] = useState(0);
  const worktreePath = serverThread?.worktreePath ?? draftThread?.worktreePath ?? null;
  const effectiveWorktreePath = useMemo(() => {
    if (launchContext !== null) {
      return launchContext.worktreePath;
    }
    return worktreePath;
  }, [launchContext, worktreePath]);
  const cwd = useMemo(
    () =>
      launchContext?.cwd ??
      (project
        ? projectScriptCwd({
            project: { cwd: project.cwd },
            worktreePath: effectiveWorktreePath,
          })
        : null),
    [effectiveWorktreePath, launchContext?.cwd, project],
  );
  const runtimeEnv = useMemo(
    () =>
      project
        ? projectScriptRuntimeEnv({
            project: { cwd: project.cwd },
            worktreePath: effectiveWorktreePath,
          })
        : {},
    [effectiveWorktreePath, project],
  );

  const bumpFocusRequestId = useCallback(() => {
    if (!visible) {
      return;
    }
    setLocalFocusRequestId((value) => value + 1);
  }, [visible]);

  const setTerminalHeight = useCallback(
    (height: number) => {
      storeSetTerminalHeight(threadRef, height);
    },
    [storeSetTerminalHeight, threadRef],
  );

  const splitTerminal = useCallback(
    (terminalGroupId: string, anchorTerminalId: string) => {
      storeSplitTerminal(threadRef, `terminal-${randomUUID()}`, {
        groupId: terminalGroupId,
        anchorTerminalId,
      });
      storeSetWorkspaceThreadLastActivePane(threadKey, "terminal");
      bumpFocusRequestId();
    },
    [
      bumpFocusRequestId,
      storeSetWorkspaceThreadLastActivePane,
      storeSplitTerminal,
      threadKey,
      threadRef,
    ],
  );

  const createNewTerminalPane = useCallback(() => {
    storeNewTerminal(threadRef, `terminal-${randomUUID()}`);
    storeSetWorkspaceThreadLastActivePane(threadKey, "terminal");
    bumpFocusRequestId();
  }, [
    bumpFocusRequestId,
    storeNewTerminal,
    storeSetWorkspaceThreadLastActivePane,
    threadKey,
    threadRef,
  ]);

  const activateTerminal = useCallback(
    (terminalId: string) => {
      storeSetActiveTerminal(threadRef, terminalId);
      storeSetWorkspaceThreadLastActivePane(threadKey, "terminal");
      bumpFocusRequestId();
    },
    [
      bumpFocusRequestId,
      storeSetActiveTerminal,
      storeSetWorkspaceThreadLastActivePane,
      threadKey,
      threadRef,
    ],
  );

  const renameTerminalPane = useCallback(
    (paneId: string, title: string | null) => {
      storeSetWorkspaceThreadPaneTitleOverride(threadKey, paneId, title);
    },
    [storeSetWorkspaceThreadPaneTitleOverride, threadKey],
  );

  const closeTerminal = useCallback(
    (terminalId: string) => {
      const api = readEnvironmentApi(threadRef.environmentId);
      if (!api) return;
      const isFinalTerminal = terminalState.terminalIds.length <= 1;
      const fallbackExitWrite = () =>
        api.terminal.write({ threadId, terminalId, data: "exit\n" }).catch(() => undefined);

      if ("close" in api.terminal && typeof api.terminal.close === "function") {
        void (async () => {
          if (isFinalTerminal) {
            await api.terminal.clear({ threadId, terminalId }).catch(() => undefined);
          }
          await api.terminal.close({
            threadId,
            terminalId,
            deleteHistory: true,
          });
        })().catch(() => fallbackExitWrite());
      } else {
        void fallbackExitWrite();
      }

      storeCloseTerminal(threadRef, terminalId);
      bumpFocusRequestId();
    },
    [bumpFocusRequestId, storeCloseTerminal, terminalState.terminalIds.length, threadId, threadRef],
  );

  const handleAddTerminalContext = useCallback(
    (selection: TerminalContextSelection) => {
      if (!visible) {
        return;
      }
      onAddTerminalContext(selection);
    },
    [onAddTerminalContext, visible],
  );

  if (!project || !terminalState.terminalOpen || !cwd) {
    return null;
  }

  const terminalGroups = terminalState.terminalGroups.flatMap((terminalGroup) => {
    const nextTerminalIds = terminalGroup.terminalIds.filter((terminalId) =>
      terminalState.terminalIds.includes(terminalId),
    );
    return nextTerminalIds.length > 0 ? [{ ...terminalGroup, terminalIds: nextTerminalIds }] : [];
  });
  const paneDeckHeight =
    Math.max(terminalState.terminalHeight, 220) * Math.max(terminalGroups.length, 1) +
    Math.max(terminalGroups.length - 1, 0) * 12;
  const terminalLabelById = Object.fromEntries(
    terminalState.terminalIds.map((terminalId, index) => [terminalId, `Terminal ${index + 1}`]),
  );

  return (
    <div
      className={cn(
        "min-h-0 min-w-0 overflow-auto",
        visible ? "flex flex-none flex-col gap-3" : "hidden",
      )}
      style={visible ? { height: `${paneDeckHeight}px` } : undefined}
    >
      {terminalGroups.map((terminalGroup, groupIndex) => {
        const isGroupActive = terminalGroup.terminalIds.includes(terminalState.activeTerminalId);
        const groupActiveTerminalId = isGroupActive
          ? terminalState.activeTerminalId
          : (terminalGroup.terminalIds[0] ?? terminalState.activeTerminalId);
        const paneTitle =
          terminalGroup.terminalIds.length > 1
            ? `Split Terminal ${groupIndex + 1}`
            : (terminalLabelById[groupActiveTerminalId] ??
              basenameOfPanePath(cwd) ??
              `Terminal ${groupIndex + 1}`);
        const paneId = `terminal:${terminalGroup.id}`;
        const title = paneTitleOverrideById[paneId] ?? paneTitle;

        return (
          <WorkspacePane
            key={terminalGroup.id}
            title={title}
            onTitleRename={(nextTitle) => renameTerminalPane(paneId, nextTitle)}
            titleActions={
              <TerminalPaneHeaderActions
                splitCount={terminalGroup.terminalIds.length}
                splitShortcutLabel={visible ? splitShortcutLabel : undefined}
                newShortcutLabel={visible ? newShortcutLabel : undefined}
                closeShortcutLabel={visible && isGroupActive ? closeShortcutLabel : undefined}
                onSplitTerminal={() => splitTerminal(terminalGroup.id, groupActiveTerminalId)}
                onNewTerminalPane={createNewTerminalPane}
                onCloseTerminal={() => closeTerminal(groupActiveTerminalId)}
              />
            }
            actions={<TerminalPanePath fullPath={cwd} />}
            className="min-h-0 flex-1"
            bodyClassName="min-h-0"
          >
            <ThreadTerminalDrawer
              threadRef={threadRef}
              threadId={threadId}
              cwd={cwd}
              worktreePath={effectiveWorktreePath}
              runtimeEnv={runtimeEnv}
              layout="pane"
              visible={visible}
              height={terminalState.terminalHeight}
              terminalIds={terminalGroup.terminalIds}
              activeTerminalId={groupActiveTerminalId}
              terminalGroups={[terminalGroup]}
              activeTerminalGroupId={terminalGroup.id}
              terminalLabelById={terminalLabelById}
              focusRequestId={
                visible && isGroupActive ? focusRequestId + localFocusRequestId + 1 : 0
              }
              closeShortcutLabel={visible && isGroupActive ? closeShortcutLabel : undefined}
              keybindings={keybindings}
              onActiveTerminalChange={activateTerminal}
              onCloseTerminal={closeTerminal}
              onHeightChange={setTerminalHeight}
              onAddTerminalContext={handleAddTerminalContext}
            />
          </WorkspacePane>
        );
      })}
    </div>
  );
});

export default function ChatView(props: ChatViewProps) {
  const {
    environmentId,
    threadId,
    routeKind,
    embeddedPaneActions,
    embeddedPaneActive = false,
    embeddedPaneLeadingActions,
    onDiffPanelOpen,
    onWorkspaceAiPaneThreadChange,
    reserveTitleBarControlInset = true,
    workspaceMode = "full",
  } = props;
  const { open: sidebarOpen } = useSidebar();
  const draftId = routeKind === "draft" ? props.draftId : null;
  const routeThreadRef = useMemo(
    () => scopeThreadRef(environmentId, threadId),
    [environmentId, threadId],
  );
  const routeThreadKey = useMemo(() => scopedThreadKey(routeThreadRef), [routeThreadRef]);
  const composerDraftTarget: ScopedThreadRef | DraftId =
    routeKind === "server" ? routeThreadRef : props.draftId;
  const serverThread = useStore(
    useMemo(
      () => createThreadSelectorByRef(routeKind === "server" ? routeThreadRef : null),
      [routeKind, routeThreadRef],
    ),
  );
  const setStoreThreadError = useStore((store) => store.setError);
  const markThreadVisited = useUiStateStore((store) => store.markThreadVisited);
  const activeThreadLastVisitedAt = useUiStateStore((store) =>
    routeKind === "server" ? store.threadLastVisitedAtById[routeThreadKey] : undefined,
  );
  const storeMigrateWorkspaceThreadLayout = useUiStateStore(
    (store) => store.migrateWorkspaceThreadLayout,
  );
  const storeSetWorkspaceThreadPlanSidebarOpen = useUiStateStore(
    (store) => store.setWorkspaceThreadPlanSidebarOpen,
  );
  const storeSetWorkspaceThreadLastActivePane = useUiStateStore(
    (store) => store.setWorkspaceThreadLastActivePane,
  );
  const storeSetWorkspaceThreadPaneTitleOverride = useUiStateStore(
    (store) => store.setWorkspaceThreadPaneTitleOverride,
  );
  const storeEnsureWorkspaceThreadDockedPaneLayout = useUiStateStore(
    (store) => store.ensureWorkspaceThreadDockedPaneLayout,
  );
  const storeSetWorkspaceThreadDockedPanes = useUiStateStore(
    (store) => store.setWorkspaceThreadDockedPanes,
  );
  const storeAddWorkspaceThreadDockedPane = useUiStateStore(
    (store) => store.addWorkspaceThreadDockedPane,
  );
  const storeSetWorkspaceThreadAiPaneBinding = useUiStateStore(
    (store) => store.setWorkspaceThreadAiPaneBinding,
  );
  const storeRemoveWorkspaceThreadDockedPane = useUiStateStore(
    (store) => store.removeWorkspaceThreadDockedPane,
  );
  const storeRestoreWorkspaceThreadDefaultDockedPane = useUiStateStore(
    (store) => store.restoreWorkspaceThreadDefaultDockedPane,
  );
  const storeSetWorkspaceThreadActiveDockedPane = useUiStateStore(
    (store) => store.setWorkspaceThreadActiveDockedPane,
  );
  const storeSetWorkspaceThreadPaneStripScrollLeft = useUiStateStore(
    (store) => store.setWorkspaceThreadPaneStripScrollLeft,
  );
  const settings = useSettings();
  const setStickyComposerModelSelection = useComposerDraftStore(
    (store) => store.setStickyModelSelection,
  );
  const timestampFormat = settings.timestampFormat;
  const autoOpenPlanSidebar = settings.autoOpenPlanSidebar;
  const navigate = useNavigate();
  const { confirmAndDeleteThread } = useThreadActions();
  const rawSearch = useSearch({
    strict: false,
    select: (params) => parseDiffRouteSearch(params),
  });
  const { resolvedTheme } = useTheme();
  // Granular store selectors — avoid subscribing to prompt changes.
  const composerRuntimeMode = useComposerDraftStore(
    (store) => store.getComposerDraft(composerDraftTarget)?.runtimeMode ?? null,
  );
  const composerInteractionMode = useComposerDraftStore(
    (store) => store.getComposerDraft(composerDraftTarget)?.interactionMode ?? null,
  );
  const composerActiveProvider = useComposerDraftStore(
    (store) => store.getComposerDraft(composerDraftTarget)?.activeProvider ?? null,
  );
  const setComposerDraftPrompt = useComposerDraftStore((store) => store.setPrompt);
  const addComposerDraftImages = useComposerDraftStore((store) => store.addImages);
  const setComposerDraftTerminalContexts = useComposerDraftStore(
    (store) => store.setTerminalContexts,
  );
  const setComposerDraftModelSelection = useComposerDraftStore((store) => store.setModelSelection);
  const setComposerDraftRuntimeMode = useComposerDraftStore((store) => store.setRuntimeMode);
  const setComposerDraftInteractionMode = useComposerDraftStore(
    (store) => store.setInteractionMode,
  );
  const clearComposerDraftContent = useComposerDraftStore((store) => store.clearComposerContent);
  const clearDraftThread = useComposerDraftStore((store) => store.clearDraftThread);
  const hasUserComposerDraftContent = useComposerDraftStore((store) => {
    const draft = store.getComposerDraft(composerDraftTarget);
    return Boolean(
      draft &&
      (draft.prompt.trim().length > 0 ||
        draft.images.length > 0 ||
        draft.persistedAttachments.length > 0 ||
        draft.terminalContexts.length > 0),
    );
  });
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const getDraftSessionByLogicalProjectKey = useComposerDraftStore(
    (store) => store.getDraftSessionByLogicalProjectKey,
  );
  const getDraftSession = useComposerDraftStore((store) => store.getDraftSession);
  const setLogicalProjectDraftThreadId = useComposerDraftStore(
    (store) => store.setLogicalProjectDraftThreadId,
  );
  const createUnmappedDraftThread = useComposerDraftStore(
    (store) => store.createUnmappedDraftThread,
  );
  const applyStickyComposerState = useComposerDraftStore((store) => store.applyStickyState);
  const draftThread = useComposerDraftStore((store) =>
    routeKind === "server"
      ? store.getDraftSessionByRef(routeThreadRef)
      : draftId
        ? store.getDraftSession(draftId)
        : null,
  );
  const promptRef = useRef("");
  const composerImagesRef = useRef<ComposerImageAttachment[]>([]);
  const composerTerminalContextsRef = useRef<TerminalContextDraft[]>([]);
  const localComposerRef = useRef<ChatComposerHandle | null>(null);
  const composerRef = useComposerHandleContext() ?? localComposerRef;
  const aiPaneRootRef = useRef<HTMLElement | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [expandedImage, setExpandedImage] = useState<ExpandedImagePreview | null>(null);
  const [optimisticUserMessages, setOptimisticUserMessages] = useState<ChatMessage[]>([]);
  const optimisticUserMessagesRef = useRef(optimisticUserMessages);
  optimisticUserMessagesRef.current = optimisticUserMessages;
  const [localDraftErrorsByDraftId, setLocalDraftErrorsByDraftId] = useState<
    Record<string, string | null>
  >({});
  const [isConnecting, _setIsConnecting] = useState(false);
  const [isRevertingCheckpoint, setIsRevertingCheckpoint] = useState(false);
  const [respondingRequestIds, setRespondingRequestIds] = useState<ApprovalRequestId[]>([]);
  const [respondingUserInputRequestIds, setRespondingUserInputRequestIds] = useState<
    ApprovalRequestId[]
  >([]);
  const [pendingUserInputAnswersByRequestId, setPendingUserInputAnswersByRequestId] = useState<
    Record<string, Record<string, PendingUserInputDraftAnswer>>
  >({});
  const [pendingUserInputQuestionIndexByRequestId, setPendingUserInputQuestionIndexByRequestId] =
    useState<Record<string, number>>({});
  const shouldUsePlanSidebarSheet = useMediaQuery(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY);
  // Tracks whether the user explicitly dismissed the sidebar for the active turn.
  const planSidebarDismissedForTurnRef = useRef<string | null>(null);
  // When set, the thread-change reset effect will open the sidebar instead of closing it.
  // Used by "Implement in a new thread" to carry the sidebar-open intent across navigation.
  const planSidebarOpenOnNextThreadRef = useRef(false);
  const [terminalFocusRequestId, setTerminalFocusRequestId] = useState(0);
  const [editorOpenFileRequest, setEditorOpenFileRequest] =
    useState<WorkspaceEditorOpenFileRequest | null>(null);
  const [pullRequestDialogState, setPullRequestDialogState] =
    useState<PullRequestDialogState | null>(null);
  const [addPaneDialogOpen, setAddPaneDialogOpen] = useState(false);
  const [terminalLaunchContext, setTerminalLaunchContext] = useState<TerminalLaunchContext | null>(
    null,
  );
  const [attachmentPreviewHandoffByMessageId, setAttachmentPreviewHandoffByMessageId] = useState<
    Record<string, string[]>
  >({});
  const [pendingServerThreadEnvMode, setPendingServerThreadEnvMode] =
    useState<DraftThreadEnvMode | null>(null);
  const [pendingServerThreadBranch, setPendingServerThreadBranch] = useState<string | null>();
  const [lastInvokedScriptByProjectId, setLastInvokedScriptByProjectId] = useLocalStorage(
    LAST_INVOKED_SCRIPT_BY_PROJECT_KEY,
    {},
    LastInvokedScriptByProjectSchema,
  );
  const legendListRef = useRef<LegendListRef | null>(null);
  const isAtEndRef = useRef(true);
  const attachmentPreviewHandoffByMessageIdRef = useRef<Record<string, string[]>>({});
  const attachmentPreviewPromotionInFlightByMessageIdRef = useRef<Record<string, true>>({});
  const sendInFlightRef = useRef(false);
  const terminalOpenByThreadRef = useRef<Record<string, boolean>>({});

  const terminalState = useTerminalUiStateStore((state) =>
    selectThreadTerminalUiState(state.terminalUiStateByThreadKey, routeThreadRef),
  );
  const terminalUiStateByThreadKey = useTerminalUiStateStore(
    (state) => state.terminalUiStateByThreadKey,
  );
  const openTerminalThreadKeys = useTerminalUiStateStore(
    useShallow((state) =>
      Object.entries(state.terminalUiStateByThreadKey).flatMap(
        ([nextThreadKey, nextTerminalState]) =>
          nextTerminalState.terminalOpen ? [nextThreadKey] : [],
      ),
    ),
  );
  const storeSetTerminalOpen = useTerminalUiStateStore((s) => s.setTerminalOpen);
  const storeSplitTerminal = useTerminalUiStateStore((s) => s.splitTerminal);
  const storeNewTerminal = useTerminalUiStateStore((s) => s.newTerminal);
  const storeSetActiveTerminal = useTerminalUiStateStore((s) => s.setActiveTerminal);
  const storeCloseTerminal = useTerminalUiStateStore((s) => s.closeTerminal);
  const serverThreadKeys = useStore(
    useShallow((state) =>
      selectThreadsAcrossEnvironments(state).map((thread) =>
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      ),
    ),
  );
  const serverThreadKeySet = useMemo(() => new Set(serverThreadKeys), [serverThreadKeys]);
  const draftThreadsByThreadKey = useComposerDraftStore((store) => store.draftThreadsByThreadKey);
  const draftThreadKeys = useMemo(
    () =>
      Object.values(draftThreadsByThreadKey).map((draftThread) =>
        scopedThreadKey(scopeThreadRef(draftThread.environmentId, draftThread.threadId)),
      ),
    [draftThreadsByThreadKey],
  );
  const draftIdByThreadKey = useMemo(() => {
    const draftIds = new Map<string, DraftId>();
    for (const [draftId, draftThread] of Object.entries(draftThreadsByThreadKey)) {
      draftIds.set(
        scopedThreadKey(scopeThreadRef(draftThread.environmentId, draftThread.threadId)),
        DraftId.make(draftId),
      );
    }
    return draftIds;
  }, [draftThreadsByThreadKey]);
  const [mountedTerminalThreadKeys, setMountedTerminalThreadKeys] = useState<string[]>([]);
  const mountedTerminalThreadRefs = useMemo(
    () =>
      mountedTerminalThreadKeys.flatMap((mountedThreadKey) => {
        const mountedThreadRef = parseScopedThreadKey(mountedThreadKey);
        return mountedThreadRef ? [{ key: mountedThreadKey, threadRef: mountedThreadRef }] : [];
      }),
    [mountedTerminalThreadKeys],
  );

  const fallbackDraftProjectRef = draftThread
    ? scopeProjectRef(draftThread.environmentId, draftThread.projectId)
    : null;
  const fallbackDraftProject = useStore(
    useMemo(() => createProjectSelectorByRef(fallbackDraftProjectRef), [fallbackDraftProjectRef]),
  );
  const localDraftError =
    routeKind === "server" && serverThread
      ? null
      : ((draftId ? localDraftErrorsByDraftId[draftId] : null) ?? null);
  const localDraftThread = useMemo(
    () =>
      draftThread
        ? buildLocalDraftThread(
            threadId,
            draftThread,
            fallbackDraftProject?.defaultModelSelection ?? {
              instanceId: ProviderInstanceId.make("codex"),
              model: DEFAULT_MODEL,
            },
            localDraftError,
          )
        : undefined,
    [draftThread, fallbackDraftProject?.defaultModelSelection, localDraftError, threadId],
  );
  const isServerThread = routeKind === "server" && serverThread !== undefined;
  const activeThread = isServerThread ? serverThread : localDraftThread;
  const runtimeMode = composerRuntimeMode ?? activeThread?.runtimeMode ?? DEFAULT_RUNTIME_MODE;
  const interactionMode =
    composerInteractionMode ?? activeThread?.interactionMode ?? DEFAULT_INTERACTION_MODE;
  const isLocalDraftThread = !isServerThread && localDraftThread !== undefined;
  const canCheckoutPullRequestIntoThread = isLocalDraftThread;
  const diffOpen = rawSearch.diff === "1";
  const activeThreadId = activeThread?.id ?? null;
  const activeThreadEnvironmentId = activeThread?.environmentId ?? null;
  const activeThreadProjectId = activeThread?.projectId ?? null;
  const activeThreadTitle = activeThread?.title ?? null;
  const runningTerminalIds = useThreadRunningTerminalIds({
    environmentId: activeThreadEnvironmentId,
    threadId: activeThreadId,
  });
  const activeThreadRef = useMemo(
    () =>
      activeThreadEnvironmentId && activeThreadId
        ? scopeThreadRef(activeThreadEnvironmentId, activeThreadId)
        : null,
    [activeThreadEnvironmentId, activeThreadId],
  );
  const activeThreadKey = activeThreadRef ? scopedThreadKey(activeThreadRef) : null;
  const existingOpenTerminalThreadKeys = useMemo(() => {
    const existingThreadKeys = new Set<string>([...serverThreadKeys, ...draftThreadKeys]);
    return openTerminalThreadKeys.filter((nextThreadKey) => existingThreadKeys.has(nextThreadKey));
  }, [draftThreadKeys, openTerminalThreadKeys, serverThreadKeys]);
  const activeLatestTurn = activeThread?.latestTurn ?? null;
  const threadPlanCatalog = useThreadPlanCatalog(
    useMemo(() => {
      const threadIds: ThreadId[] = [];
      if (activeThread?.id) {
        threadIds.push(activeThread.id);
      }
      const sourceThreadId = activeLatestTurn?.sourceProposedPlan?.threadId;
      if (sourceThreadId && sourceThreadId !== activeThread?.id) {
        threadIds.push(sourceThreadId);
      }
      return threadIds;
    }, [activeLatestTurn?.sourceProposedPlan?.threadId, activeThread?.id]),
  );
  useEffect(() => {
    setMountedTerminalThreadKeys((currentThreadIds) => {
      const nextThreadIds = reconcileMountedTerminalThreadIds({
        currentThreadIds,
        openThreadIds: existingOpenTerminalThreadKeys,
        activeThreadId: activeThreadKey,
        activeThreadTerminalOpen: Boolean(activeThreadKey && terminalState.terminalOpen),
        maxHiddenThreadCount: MAX_HIDDEN_MOUNTED_TERMINAL_THREADS,
      });
      return currentThreadIds.length === nextThreadIds.length &&
        currentThreadIds.every((nextThreadId, index) => nextThreadId === nextThreadIds[index])
        ? currentThreadIds
        : nextThreadIds;
    });
  }, [activeThreadKey, existingOpenTerminalThreadKeys, terminalState.terminalOpen]);
  const latestTurnSettled = isLatestTurnSettled(activeLatestTurn, activeThread?.session ?? null);
  const activeProjectRef = activeThread
    ? scopeProjectRef(activeThread.environmentId, activeThread.projectId)
    : null;
  const activeProject = useStore(
    useMemo(() => createProjectSelectorByRef(activeProjectRef), [activeProjectRef]),
  );

  useEffect(() => {
    if (routeKind !== "server") {
      return;
    }
    return retainThreadDetailSubscription(environmentId, threadId);
  }, [environmentId, routeKind, threadId]);

  // Compute the list of environments this logical project spans, used to
  // drive the environment picker in BranchToolbar.
  const allProjects = useStore(useShallow(selectProjectsAcrossEnvironments));
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const savedEnvironmentRegistry = useSavedEnvironmentRegistryStore((s) => s.byId);
  const savedEnvironmentRuntimeById = useSavedEnvironmentRuntimeStore((s) => s.byId);
  const activeSavedEnvironmentRecord =
    activeThread && activeThread.environmentId !== primaryEnvironmentId
      ? (savedEnvironmentRegistry[activeThread.environmentId] ?? null)
      : null;
  const activeSavedEnvironmentRuntime = activeSavedEnvironmentRecord
    ? (savedEnvironmentRuntimeById[activeSavedEnvironmentRecord.environmentId] ?? null)
    : null;
  const activeSavedEnvironmentConnectionState = activeSavedEnvironmentRecord
    ? (activeSavedEnvironmentRuntime?.connectionState ?? "disconnected")
    : "connected";
  const activeEnvironmentUnavailable =
    activeSavedEnvironmentRecord !== null && activeSavedEnvironmentConnectionState !== "connected";
  const activeSavedEnvironmentId = activeSavedEnvironmentRecord?.environmentId ?? null;
  const activeEnvironmentUnavailableLabel = activeSavedEnvironmentRecord
    ? resolveEnvironmentOptionLabel({
        isPrimary: false,
        environmentId: activeSavedEnvironmentRecord.environmentId,
        runtimeLabel: activeSavedEnvironmentRuntime?.descriptor?.label ?? null,
        savedLabel: activeSavedEnvironmentRecord.label,
      })
    : null;
  const activeEnvironmentUnavailableState = useMemo<EnvironmentUnavailableState | null>(() => {
    if (
      !activeEnvironmentUnavailable ||
      !activeEnvironmentUnavailableLabel ||
      !activeSavedEnvironmentId
    ) {
      return null;
    }

    return {
      environmentId: activeSavedEnvironmentId,
      label: activeEnvironmentUnavailableLabel,
      connectionState:
        activeSavedEnvironmentConnectionState === "connecting" ||
        activeSavedEnvironmentConnectionState === "error"
          ? activeSavedEnvironmentConnectionState
          : "disconnected",
    };
  }, [
    activeEnvironmentUnavailable,
    activeEnvironmentUnavailableLabel,
    activeSavedEnvironmentConnectionState,
    activeSavedEnvironmentId,
  ]);
  const [reconnectingEnvironmentId, setReconnectingEnvironmentId] = useState<EnvironmentId | null>(
    null,
  );
  const handleReconnectActiveEnvironment = useCallback(
    async (environmentId: EnvironmentId, label: string) => {
      setReconnectingEnvironmentId(environmentId);
      try {
        await reconnectSavedEnvironment(environmentId);
        toastManager.add({
          type: "success",
          title: "Environment reconnected",
          description: `${label} is ready.`,
        });
      } catch (error) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not reconnect environment",
            description: error instanceof Error ? error.message : "Failed to reconnect.",
          }),
        );
      } finally {
        setReconnectingEnvironmentId(null);
      }
    },
    [],
  );
  const projectGroupingSettings = useSettings(selectProjectGroupingSettings);
  const logicalProjectEnvironments = useMemo(() => {
    if (!activeProject) return [];
    const logicalKey = deriveLogicalProjectKeyFromSettings(activeProject, projectGroupingSettings);
    const memberProjects = allProjects.filter(
      (p) => deriveLogicalProjectKeyFromSettings(p, projectGroupingSettings) === logicalKey,
    );
    const seen = new Set<string>();
    const envs: Array<{
      environmentId: EnvironmentId;
      projectId: ProjectId;
      label: string;
      isPrimary: boolean;
    }> = [];
    for (const p of memberProjects) {
      if (seen.has(p.environmentId)) continue;
      seen.add(p.environmentId);
      const isPrimary = p.environmentId === primaryEnvironmentId;
      const savedRecord = savedEnvironmentRegistry[p.environmentId];
      const runtimeState = savedEnvironmentRuntimeById[p.environmentId];
      const label = resolveEnvironmentOptionLabel({
        isPrimary,
        environmentId: p.environmentId,
        runtimeLabel: runtimeState?.descriptor?.label ?? null,
        savedLabel: savedRecord?.label ?? null,
      });
      envs.push({
        environmentId: p.environmentId,
        projectId: p.id,
        label,
        isPrimary,
      });
    }
    // Sort: primary first, then alphabetical
    envs.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
    return envs;
  }, [
    activeProject,
    allProjects,
    projectGroupingSettings,
    primaryEnvironmentId,
    savedEnvironmentRegistry,
    savedEnvironmentRuntimeById,
  ]);
  const activeWorkspaceProjectRefs = useMemo(() => {
    if (!activeProject) return [];
    const logicalKey = deriveLogicalProjectKeyFromSettings(activeProject, projectGroupingSettings);
    return allProjects
      .filter(
        (project) =>
          deriveLogicalProjectKeyFromSettings(project, projectGroupingSettings) === logicalKey,
      )
      .map((project) => scopeProjectRef(project.environmentId, project.id));
  }, [activeProject, allProjects, projectGroupingSettings]);
  const activeWorkspaceThreads = useStore(
    useShallow(
      useMemo(
        () => (state: import("../store").AppState) =>
          activeWorkspaceProjectRefs.length === 0
            ? []
            : selectSidebarThreadsForProjectRefs(state, activeWorkspaceProjectRefs),
        [activeWorkspaceProjectRefs],
      ),
    ),
  );
  const activeWorkspaceThreadOptions = useMemo(
    () =>
      activeWorkspaceThreads
        .filter((thread) => thread.archivedAt === null)
        .toSorted((left, right) => {
          const rightTimestamp = Date.parse(
            right.latestUserMessageAt ?? right.updatedAt ?? right.createdAt,
          );
          const leftTimestamp = Date.parse(
            left.latestUserMessageAt ?? left.updatedAt ?? left.createdAt,
          );
          const byTimestamp =
            (Number.isNaN(rightTimestamp) ? 0 : rightTimestamp) -
            (Number.isNaN(leftTimestamp) ? 0 : leftTimestamp);
          if (byTimestamp !== 0) return byTimestamp;
          return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
        }),
    [activeWorkspaceThreads],
  );
  const fallbackWorkspaceThread = useMemo(() => {
    if (activeWorkspaceThreadOptions.length === 0) {
      return null;
    }
    return (
      activeWorkspaceThreadOptions.find((thread) => {
        const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
        return threadKey !== activeThreadKey;
      }) ?? null
    );
  }, [activeThreadKey, activeWorkspaceThreadOptions]);
  const hasMultipleEnvironments = logicalProjectEnvironments.length > 1;

  const openPullRequestDialog = useCallback(
    (reference?: string) => {
      if (!canCheckoutPullRequestIntoThread) {
        return;
      }
      setPullRequestDialogState({
        initialReference: reference ?? null,
        key: Date.now(),
      });
    },
    [canCheckoutPullRequestIntoThread],
  );

  const closePullRequestDialog = useCallback(() => {
    setPullRequestDialogState(null);
  }, []);

  const openOrReuseProjectDraftThread = useCallback(
    async (input: { branch: string; worktreePath: string | null; envMode: DraftThreadEnvMode }) => {
      if (!activeProject) {
        throw new Error("No active project is available for this pull request.");
      }
      const activeProjectRef = scopeProjectRef(activeProject.environmentId, activeProject.id);
      const logicalProjectKey = deriveLogicalProjectKeyFromSettings(
        activeProject,
        projectGroupingSettings,
      );
      const storedDraftSession = getDraftSessionByLogicalProjectKey(logicalProjectKey);
      if (storedDraftSession) {
        setDraftThreadContext(storedDraftSession.draftId, input);
        setLogicalProjectDraftThreadId(
          logicalProjectKey,
          activeProjectRef,
          storedDraftSession.draftId,
          {
            threadId: storedDraftSession.threadId,
            ...input,
          },
        );
        if (routeKind !== "draft" || draftId !== storedDraftSession.draftId) {
          await navigate({
            to: "/draft/$draftId",
            params: buildDraftThreadRouteParams(storedDraftSession.draftId),
          });
        }
        return storedDraftSession.threadId;
      }

      const activeDraftSession = routeKind === "draft" && draftId ? getDraftSession(draftId) : null;
      if (
        !isServerThread &&
        activeDraftSession?.logicalProjectKey === logicalProjectKey &&
        draftId
      ) {
        setDraftThreadContext(draftId, input);
        setLogicalProjectDraftThreadId(logicalProjectKey, activeProjectRef, draftId, {
          threadId: activeDraftSession.threadId,
          createdAt: activeDraftSession.createdAt,
          runtimeMode: activeDraftSession.runtimeMode,
          interactionMode: activeDraftSession.interactionMode,
          ...input,
        });
        return activeDraftSession.threadId;
      }

      const nextDraftId = newDraftId();
      const nextThreadId = newThreadId();
      setLogicalProjectDraftThreadId(logicalProjectKey, activeProjectRef, nextDraftId, {
        threadId: nextThreadId,
        createdAt: new Date().toISOString(),
        runtimeMode: DEFAULT_RUNTIME_MODE,
        interactionMode: DEFAULT_INTERACTION_MODE,
        ...input,
      });
      await navigate({
        to: "/draft/$draftId",
        params: buildDraftThreadRouteParams(nextDraftId),
      });
      return nextThreadId;
    },
    [
      activeProject,
      draftId,
      getDraftSession,
      getDraftSessionByLogicalProjectKey,
      isServerThread,
      navigate,
      projectGroupingSettings,
      routeKind,
      setDraftThreadContext,
      setLogicalProjectDraftThreadId,
    ],
  );

  const handlePreparedPullRequestThread = useCallback(
    async (input: { branch: string; worktreePath: string | null }) => {
      await openOrReuseProjectDraftThread({
        branch: input.branch,
        worktreePath: input.worktreePath,
        envMode: input.worktreePath ? "worktree" : "local",
      });
    },
    [openOrReuseProjectDraftThread],
  );

  useEffect(() => {
    if (!serverThread?.id) return;
    if (!latestTurnSettled) return;
    if (!activeLatestTurn?.completedAt) return;
    const turnCompletedAt = Date.parse(activeLatestTurn.completedAt);
    if (Number.isNaN(turnCompletedAt)) return;
    const lastVisitedAt = activeThreadLastVisitedAt ? Date.parse(activeThreadLastVisitedAt) : NaN;
    if (!Number.isNaN(lastVisitedAt) && lastVisitedAt >= turnCompletedAt) return;

    markThreadVisited(
      scopedThreadKey(scopeThreadRef(serverThread.environmentId, serverThread.id)),
      activeLatestTurn.completedAt,
    );
  }, [
    activeLatestTurn?.completedAt,
    activeThreadLastVisitedAt,
    latestTurnSettled,
    markThreadVisited,
    serverThread?.environmentId,
    serverThread?.id,
  ]);

  const selectedProviderByThreadId = composerActiveProvider ?? null;
  const threadProvider =
    activeThread?.modelSelection.instanceId ??
    activeProject?.defaultModelSelection?.instanceId ??
    null;
  const lockedProvider = deriveLockedProvider({
    thread: activeThread,
    selectedProvider: selectedProviderByThreadId,
    threadProvider,
  });
  const primaryServerConfig = useServerConfig();
  const activeEnvRuntimeState = useSavedEnvironmentRuntimeStore((s) =>
    activeThread?.environmentId ? s.byId[activeThread.environmentId] : null,
  );
  // Use the server config for the thread's environment.  For the primary
  // environment fall back to the global atom; for remote environments use
  // the runtime state stored by the environment manager.
  const serverConfig =
    primaryEnvironmentId && activeThread?.environmentId === primaryEnvironmentId
      ? primaryServerConfig
      : (activeEnvRuntimeState?.serverConfig ?? primaryServerConfig);
  const versionMismatch = resolveServerConfigVersionMismatch(serverConfig);
  const versionMismatchDismissKey =
    versionMismatch && activeThread
      ? buildVersionMismatchDismissalKey(activeThread.environmentId, versionMismatch)
      : null;
  const [dismissedVersionMismatchKey, setDismissedVersionMismatchKey] = useState<string | null>(
    null,
  );
  const versionMismatchDismissed =
    versionMismatchDismissKey === dismissedVersionMismatchKey ||
    isVersionMismatchDismissed(versionMismatchDismissKey);
  const showVersionMismatchBanner =
    versionMismatch !== null && versionMismatchDismissKey !== null && !versionMismatchDismissed;
  const hasMultipleRegisteredEnvironments = Object.keys(savedEnvironmentRegistry).length > 0;
  const versionMismatchServerLabel = useMemo(() => {
    if (!hasMultipleRegisteredEnvironments || !activeThread) {
      return "server";
    }

    const isPrimary = activeThread.environmentId === primaryEnvironmentId;
    const savedRecord = savedEnvironmentRegistry[activeThread.environmentId];
    const runtimeState = savedEnvironmentRuntimeById[activeThread.environmentId];
    return `${resolveEnvironmentOptionLabel({
      isPrimary,
      environmentId: activeThread.environmentId,
      runtimeLabel: runtimeState?.descriptor?.label ?? serverConfig?.environment.label ?? null,
      savedLabel: savedRecord?.label ?? null,
    })} server`;
  }, [
    activeThread,
    hasMultipleRegisteredEnvironments,
    primaryEnvironmentId,
    savedEnvironmentRegistry,
    savedEnvironmentRuntimeById,
    serverConfig?.environment.label,
  ]);
  const composerBannerItems = useMemo<ComposerBannerStackItem[]>(() => {
    const items: ComposerBannerStackItem[] = [];
    if (activeEnvironmentUnavailableState) {
      items.push({
        id: `environment-unavailable:${activeEnvironmentUnavailableState.environmentId}`,
        variant:
          activeEnvironmentUnavailableState.connectionState === "error" ? "error" : "warning",
        icon: <WifiOffIcon />,
        title: (
          <>
            {activeEnvironmentUnavailableState.label} is{" "}
            {activeEnvironmentUnavailableState.connectionState === "connecting"
              ? "connecting"
              : "disconnected"}
          </>
        ),
        description: "Reconnect this environment before sending messages or running actions.",
        actions: (
          <>
            <Button
              size="xs"
              disabled={
                activeEnvironmentUnavailableState.connectionState === "connecting" ||
                reconnectingEnvironmentId === activeEnvironmentUnavailableState.environmentId
              }
              onClick={() =>
                void handleReconnectActiveEnvironment(
                  activeEnvironmentUnavailableState.environmentId,
                  activeEnvironmentUnavailableState.label,
                )
              }
            >
              {activeEnvironmentUnavailableState.connectionState === "connecting" ||
              reconnectingEnvironmentId === activeEnvironmentUnavailableState.environmentId
                ? "Reconnecting..."
                : "Reconnect"}
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => void navigate({ to: "/settings/connections" })}
            >
              Connections
            </Button>
          </>
        ),
      });
    }
    if (showVersionMismatchBanner && versionMismatch && versionMismatchDismissKey) {
      items.push({
        id: `version-mismatch:${versionMismatchDismissKey}`,
        variant: "warning",
        icon: <TriangleAlertIcon />,
        title: "Client and server versions differ",
        description: (
          <>
            Client {versionMismatch.clientVersion} is connected to {versionMismatchServerLabel}{" "}
            {versionMismatch.serverVersion}. Sync them if RPC calls or reconnects fail.
          </>
        ),
        dismissLabel: "Dismiss version mismatch warning",
        onDismiss: () => {
          dismissVersionMismatch(versionMismatchDismissKey);
          setDismissedVersionMismatchKey(versionMismatchDismissKey);
        },
      });
    }
    return items;
  }, [
    activeEnvironmentUnavailableState,
    handleReconnectActiveEnvironment,
    navigate,
    reconnectingEnvironmentId,
    showVersionMismatchBanner,
    versionMismatch,
    versionMismatchDismissKey,
    versionMismatchServerLabel,
  ]);
  const providerStatuses = serverConfig?.providers ?? EMPTY_PROVIDERS;
  const workspaceName = activeProject?.name?.trim() || null;
  const activeProjectCwd = activeProject?.cwd ?? null;
  const activeThreadWorktreePath = activeThread?.worktreePath ?? null;
  const activeWorkspaceRoot = activeThreadWorktreePath ?? activeProjectCwd ?? undefined;
  const workspaceLayoutKey = useMemo(
    () =>
      workspaceMode === "full" && activeThreadEnvironmentId && activeThreadProjectId
        ? workspacePaneLayoutKey({
            environmentId: activeThreadEnvironmentId,
            projectId: activeThreadProjectId,
            workspaceRoot: activeWorkspaceRoot,
          })
        : routeThreadKey,
    [
      activeThreadEnvironmentId,
      activeThreadProjectId,
      activeWorkspaceRoot,
      routeThreadKey,
      workspaceMode,
    ],
  );
  const planSidebarOpen = useUiStateStore(
    (store) => store.workspaceThreadLayoutById[workspaceLayoutKey]?.planSidebarOpen ?? false,
  );
  const paneTitleOverrideById = useUiStateStore(
    (store) =>
      store.workspaceThreadLayoutById[workspaceLayoutKey]?.paneTitleOverrideById ??
      EMPTY_PANE_TITLE_OVERRIDES,
  );
  const workspaceDockedPanes = useUiStateStore(
    (store) =>
      store.workspaceThreadLayoutById[workspaceLayoutKey]?.panes ?? EMPTY_WORKSPACE_DOCKED_PANES,
  );
  const activeWorkspaceDockedPaneId = useUiStateStore(
    (store) => store.workspaceThreadLayoutById[workspaceLayoutKey]?.activePaneId ?? null,
  );
  const workspacePaneStripScrollLeft = useUiStateStore(
    (store) => store.workspaceThreadLayoutById[workspaceLayoutKey]?.paneStripScrollLeft ?? 0,
  );
  const renameWorkspacePane = useCallback(
    (paneId: string, title: string | null) => {
      storeSetWorkspaceThreadPaneTitleOverride(workspaceLayoutKey, paneId, title);
    },
    [storeSetWorkspaceThreadPaneTitleOverride, workspaceLayoutKey],
  );
  const setPlanSidebarOpen = useCallback(
    (value: boolean | ((open: boolean) => boolean)) => {
      const currentOpen =
        useUiStateStore.getState().workspaceThreadLayoutById[workspaceLayoutKey]?.planSidebarOpen ??
        false;
      const nextOpen = typeof value === "function" ? value(currentOpen) : value;
      storeSetWorkspaceThreadPlanSidebarOpen(workspaceLayoutKey, nextOpen);
    },
    [storeSetWorkspaceThreadPlanSidebarOpen, workspaceLayoutKey],
  );
  useEffect(() => {
    if (workspaceLayoutKey !== routeThreadKey) {
      storeMigrateWorkspaceThreadLayout(routeThreadKey, workspaceLayoutKey);
    }
  }, [routeThreadKey, storeMigrateWorkspaceThreadLayout, workspaceLayoutKey]);
  const addWorkspacePane = useCallback(
    (input: {
      type: WorkspaceDockedPaneType;
      environmentId: EnvironmentId;
      cwd: string;
      title: string;
    }) => {
      if (!activeThread || !activeThreadKey || !activeThreadRef) {
        return;
      }
      const paneId = `${input.type}:${randomUUID()}`;
      const terminalId = input.type === "terminal" ? `terminal-${randomUUID()}` : null;
      const terminalGroupId = terminalId ? `group-${terminalId}` : null;
      if (terminalId) {
        storeNewTerminal(activeThreadRef, terminalId);
        storeSetTerminalOpen(activeThreadRef, true);
      }
      storeAddWorkspaceThreadDockedPane(workspaceLayoutKey, {
        paneId,
        type: input.type,
        title: input.title,
        environmentId: input.environmentId,
        cwd: input.cwd,
        threadId: activeThread.id,
        terminalId,
        terminalGroupId,
      });
      if (input.type === "terminal") {
        storeSetWorkspaceThreadLastActivePane(workspaceLayoutKey, "terminal");
      } else {
        storeSetWorkspaceThreadLastActivePane(workspaceLayoutKey, input.type);
      }
    },
    [
      activeThread,
      activeThreadKey,
      activeThreadRef,
      storeAddWorkspaceThreadDockedPane,
      storeNewTerminal,
      storeSetTerminalOpen,
      storeSetWorkspaceThreadLastActivePane,
      workspaceLayoutKey,
    ],
  );
  const setWorkspaceAiPaneThreadBinding = useCallback(
    (paneId: string, threadRef: ScopedThreadRef, title: string) => {
      storeSetWorkspaceThreadAiPaneBinding(workspaceLayoutKey, paneId, {
        threadId: threadRef.threadId,
        environmentId: threadRef.environmentId,
        title,
      });
    },
    [storeSetWorkspaceThreadAiPaneBinding, workspaceLayoutKey],
  );
  const clearWorkspaceAiPaneThreadBinding = useCallback(
    (paneId: string, title = "AI") => {
      storeSetWorkspaceThreadAiPaneBinding(workspaceLayoutKey, paneId, {
        threadId: null,
        title,
      });
    },
    [storeSetWorkspaceThreadAiPaneBinding, workspaceLayoutKey],
  );
  const bindScopedAiPaneThread = useCallback(
    async (input: {
      draftId: DraftId;
      threadRef: ScopedThreadRef;
      title: string;
      paneId?: string;
    }) => {
      if (onWorkspaceAiPaneThreadChange) {
        onWorkspaceAiPaneThreadChange(scopedThreadKey(input.threadRef), { title: input.title });
        return;
      }
      const paneId = input.paneId ?? "ai";
      setWorkspaceAiPaneThreadBinding(paneId, input.threadRef, input.title);
      if (paneId !== "ai") {
        return;
      }
      await navigate({
        to: "/draft/$draftId",
        params: buildDraftThreadRouteParams(input.draftId),
      });
    },
    [navigate, onWorkspaceAiPaneThreadChange, setWorkspaceAiPaneThreadBinding],
  );
  const createScopedAiPaneThread = useCallback(
    async (mode: "contextual" | "default", paneId = "ai") => {
      if (!activeThread || !activeThreadRef || !activeProject) {
        return;
      }
      const activeProjectRef = scopeProjectRef(activeThread.environmentId, activeThread.projectId);
      const logicalProjectKey = deriveLogicalProjectKeyFromSettings(
        activeProject,
        projectGroupingSettings,
      );
      const draftId = newDraftId();
      const nextThreadId = newThreadId();
      const createdAt = new Date().toISOString();
      aiPaneDraftOrigins.set(draftId, {
        threadRef: activeThreadRef,
        title: activeThread.title,
        route:
          routeKind === "draft" ? { kind: "draft", draftId: props.draftId } : { kind: "server" },
      });
      const defaultEnvMode = resolveSidebarNewThreadEnvMode({
        defaultEnvMode: settings.defaultThreadEnvMode,
      });
      const seedContext =
        mode === "contextual"
          ? {
              branch: activeThread.branch,
              worktreePath: activeThread.worktreePath,
              envMode: draftThread?.envMode ?? (activeThread.worktreePath ? "worktree" : "local"),
            }
          : resolveSidebarNewThreadSeedContext({
              projectId: activeThread.projectId,
              defaultEnvMode,
              activeThread: {
                projectId: activeThread.projectId,
                branch: activeThread.branch,
                worktreePath: activeThread.worktreePath,
              },
              activeDraftThread: draftThread
                ? {
                    projectId: draftThread.projectId,
                    branch: draftThread.branch,
                    worktreePath: draftThread.worktreePath,
                    envMode: draftThread.envMode,
                  }
                : null,
            });

      createUnmappedDraftThread(
        logicalProjectKey || scopedProjectKey(activeProjectRef),
        activeProjectRef,
        draftId,
        {
          threadId: nextThreadId,
          createdAt,
          ...(seedContext.branch !== undefined ? { branch: seedContext.branch } : {}),
          ...(seedContext.worktreePath !== undefined
            ? { worktreePath: seedContext.worktreePath }
            : {}),
          envMode: seedContext.envMode,
          runtimeMode,
          interactionMode,
        },
      );
      applyStickyComposerState(draftId);
      await bindScopedAiPaneThread({
        draftId,
        threadRef: scopeThreadRef(activeThread.environmentId, nextThreadId),
        title: "New thread",
        paneId,
      });
    },
    [
      activeProject,
      activeThread,
      activeThreadRef,
      applyStickyComposerState,
      bindScopedAiPaneThread,
      createUnmappedDraftThread,
      draftThread,
      interactionMode,
      projectGroupingSettings,
      props.draftId,
      routeKind,
      runtimeMode,
      settings.defaultThreadEnvMode,
    ],
  );
  useEffect(() => {
    setEditorOpenFileRequest(null);
  }, [activeThread?.id, activeWorkspaceRoot]);
  const claudeRuntimeStatusQuery = useQuery(
    providerRuntimeStatusQueryOptions({
      environmentId,
      provider: ProviderDriverKind.make("claudeAgent"),
      cwd: activeWorkspaceRoot,
      enabled: activeWorkspaceRoot !== undefined,
    }),
  );
  const providerStatusesForChat = useMemo<ReadonlyArray<ServerProvider>>(() => {
    const runtimeClaudeStatus = claudeRuntimeStatusQuery.data;
    if (!runtimeClaudeStatus) {
      return providerStatuses as ServerProvider[];
    }

    return (providerStatuses as ServerProvider[]).map((provider) =>
      provider.driver === ProviderDriverKind.make("claudeAgent") &&
      provider.instanceId === ProviderInstanceId.make("claudeAgent")
        ? runtimeClaudeStatus
        : provider,
    );
  }, [claudeRuntimeStatusQuery.data, providerStatuses]);
  const unlockedSelectedProvider = resolveSelectableProvider(
    providerStatusesForChat,
    selectedProviderByThreadId ?? threadProvider ?? ProviderDriverKind.make("codex"),
  );
  const selectedProvider: ProviderDriverKind = lockedProvider ?? unlockedSelectedProvider;
  const phase = derivePhase(activeThread?.session ?? null);
  const threadActivities = activeThread?.activities ?? EMPTY_ACTIVITIES;
  const workLogEntries = useMemo(
    () => deriveWorkLogEntries(threadActivities, activeLatestTurn?.turnId ?? undefined),
    [activeLatestTurn?.turnId, threadActivities],
  );
  const latestTurnHasToolActivity = useMemo(
    () => hasToolActivityForTurn(threadActivities, activeLatestTurn?.turnId),
    [activeLatestTurn?.turnId, threadActivities],
  );
  const pendingApprovals = useMemo(
    () => derivePendingApprovals(threadActivities),
    [threadActivities],
  );
  const pendingUserInputs = useMemo(
    () => derivePendingUserInputs(threadActivities),
    [threadActivities],
  );
  const activePendingUserInput = pendingUserInputs[0] ?? null;
  const activePendingDraftAnswers = useMemo(
    () =>
      activePendingUserInput
        ? (pendingUserInputAnswersByRequestId[activePendingUserInput.requestId] ??
          EMPTY_PENDING_USER_INPUT_ANSWERS)
        : EMPTY_PENDING_USER_INPUT_ANSWERS,
    [activePendingUserInput, pendingUserInputAnswersByRequestId],
  );
  const activePendingQuestionIndex = activePendingUserInput
    ? (pendingUserInputQuestionIndexByRequestId[activePendingUserInput.requestId] ?? 0)
    : 0;
  const activePendingProgress = useMemo(
    () =>
      activePendingUserInput
        ? derivePendingUserInputProgress(
            activePendingUserInput.questions,
            activePendingDraftAnswers,
            activePendingQuestionIndex,
          )
        : null,
    [activePendingDraftAnswers, activePendingQuestionIndex, activePendingUserInput],
  );
  const activePendingResolvedAnswers = useMemo(
    () =>
      activePendingUserInput
        ? buildPendingUserInputAnswers(activePendingUserInput.questions, activePendingDraftAnswers)
        : null,
    [activePendingDraftAnswers, activePendingUserInput],
  );
  const activePendingIsResponding = activePendingUserInput
    ? respondingUserInputRequestIds.includes(activePendingUserInput.requestId)
    : false;
  const activeProposedPlan = useMemo(() => {
    if (!latestTurnSettled) {
      return null;
    }
    return findLatestProposedPlan(
      activeThread?.proposedPlans ?? [],
      activeLatestTurn?.turnId ?? null,
    );
  }, [activeLatestTurn?.turnId, activeThread?.proposedPlans, latestTurnSettled]);
  const sidebarProposedPlan = useMemo(
    () =>
      findSidebarProposedPlan({
        threads: threadPlanCatalog,
        latestTurn: activeLatestTurn,
        latestTurnSettled,
        threadId: activeThread?.id ?? null,
      }),
    [activeLatestTurn, activeThread?.id, latestTurnSettled, threadPlanCatalog],
  );
  const activePlan = useMemo(
    () => deriveActivePlanState(threadActivities, activeLatestTurn?.turnId ?? undefined),
    [activeLatestTurn?.turnId, threadActivities],
  );
  const planSidebarLabel = sidebarProposedPlan || interactionMode === "plan" ? "Plan" : "Tasks";
  const showPlanFollowUpPrompt =
    pendingUserInputs.length === 0 &&
    interactionMode === "plan" &&
    latestTurnSettled &&
    hasActionableProposedPlan(activeProposedPlan);
  const activePendingApproval = pendingApprovals[0] ?? null;
  const {
    beginLocalDispatch,
    resetLocalDispatch,
    localDispatchStartedAt,
    isPreparingWorktree,
    isSendBusy,
  } = useLocalDispatchState({
    activeThread,
    activeLatestTurn,
    phase,
    activePendingApproval: activePendingApproval?.requestId ?? null,
    activePendingUserInput: activePendingUserInput?.requestId ?? null,
    threadError: activeThread?.error,
  });
  const isWorking = phase === "running" || isSendBusy || isConnecting || isRevertingCheckpoint;
  useEffect(() => {
    if (props.draftId && draftThread?.promotedTo) {
      aiPaneDraftOrigins.delete(props.draftId);
    }
  }, [draftThread?.promotedTo, props.draftId]);
  const canCancelCleanDraftThread = Boolean(
    isLocalDraftThread &&
    activeThread &&
    activeThread.messages.length === 0 &&
    optimisticUserMessages.length === 0 &&
    !draftThread?.promotedTo &&
    !hasUserComposerDraftContent &&
    (!onWorkspaceAiPaneThreadChange ||
      fallbackWorkspaceThread ||
      (props.draftId && aiPaneDraftOrigins.has(props.draftId))) &&
    !isWorking,
  );
  const cancelCleanDraftThread = useCallback(async () => {
    if (!canCancelCleanDraftThread) {
      return;
    }
    const draftOrigin = props.draftId ? aiPaneDraftOrigins.get(props.draftId) : undefined;
    const discardDraft = () => {
      clearDraftThread(composerDraftTarget);
      if (props.draftId) {
        aiPaneDraftOrigins.delete(props.draftId);
      }
    };

    if (draftOrigin) {
      if (onWorkspaceAiPaneThreadChange) {
        onWorkspaceAiPaneThreadChange(scopedThreadKey(draftOrigin.threadRef), {
          title: draftOrigin.title,
        });
        discardDraft();
        return;
      }
      if (draftOrigin.route.kind === "draft") {
        setWorkspaceAiPaneThreadBinding("ai", draftOrigin.threadRef, draftOrigin.title);
        await navigate({
          to: "/draft/$draftId",
          params: buildDraftThreadRouteParams(draftOrigin.route.draftId),
          replace: true,
        });
        discardDraft();
        return;
      }
      setWorkspaceAiPaneThreadBinding("ai", draftOrigin.threadRef, draftOrigin.title);
      await navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(draftOrigin.threadRef),
        replace: true,
      });
      discardDraft();
      return;
    }
    if (fallbackWorkspaceThread) {
      const fallbackThreadRef = scopeThreadRef(
        fallbackWorkspaceThread.environmentId,
        fallbackWorkspaceThread.id,
      );
      if (onWorkspaceAiPaneThreadChange) {
        onWorkspaceAiPaneThreadChange(scopedThreadKey(fallbackThreadRef), {
          title: fallbackWorkspaceThread.title,
        });
        discardDraft();
        return;
      }
      setWorkspaceAiPaneThreadBinding("ai", fallbackThreadRef, fallbackWorkspaceThread.title);
      await navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(fallbackThreadRef),
        replace: true,
      });
      discardDraft();
      return;
    }

    if (onWorkspaceAiPaneThreadChange) {
      onWorkspaceAiPaneThreadChange(null);
      discardDraft();
      return;
    }
    await navigate({ to: "/", replace: true });
    discardDraft();
  }, [
    canCancelCleanDraftThread,
    clearDraftThread,
    composerDraftTarget,
    fallbackWorkspaceThread,
    navigate,
    onWorkspaceAiPaneThreadChange,
    props.draftId,
    setWorkspaceAiPaneThreadBinding,
  ]);
  const activeWorkStartedAt = deriveActiveWorkStartedAt(
    activeLatestTurn,
    activeThread?.session ?? null,
    localDispatchStartedAt,
  );
  useEffect(() => {
    attachmentPreviewHandoffByMessageIdRef.current = attachmentPreviewHandoffByMessageId;
  }, [attachmentPreviewHandoffByMessageId]);
  const clearAttachmentPreviewHandoff = useCallback(
    (messageId: MessageId, previewUrls?: ReadonlyArray<string>) => {
      delete attachmentPreviewPromotionInFlightByMessageIdRef.current[messageId];
      const currentPreviewUrls =
        previewUrls ?? attachmentPreviewHandoffByMessageIdRef.current[messageId] ?? [];
      setAttachmentPreviewHandoffByMessageId((existing) => {
        if (!(messageId in existing)) {
          return existing;
        }
        const next = { ...existing };
        delete next[messageId];
        attachmentPreviewHandoffByMessageIdRef.current = next;
        return next;
      });
      for (const previewUrl of currentPreviewUrls) {
        revokeBlobPreviewUrl(previewUrl);
      }
    },
    [],
  );
  const clearAttachmentPreviewHandoffs = useCallback(() => {
    attachmentPreviewPromotionInFlightByMessageIdRef.current = {};
    for (const previewUrls of Object.values(attachmentPreviewHandoffByMessageIdRef.current)) {
      for (const previewUrl of previewUrls) {
        revokeBlobPreviewUrl(previewUrl);
      }
    }
    attachmentPreviewHandoffByMessageIdRef.current = {};
    setAttachmentPreviewHandoffByMessageId({});
  }, []);
  useEffect(() => {
    return () => {
      clearAttachmentPreviewHandoffs();
      for (const message of optimisticUserMessagesRef.current) {
        revokeUserMessagePreviewUrls(message);
      }
    };
  }, [clearAttachmentPreviewHandoffs]);
  const handoffAttachmentPreviews = useCallback((messageId: MessageId, previewUrls: string[]) => {
    if (previewUrls.length === 0) return;

    const previousPreviewUrls = attachmentPreviewHandoffByMessageIdRef.current[messageId] ?? [];
    for (const previewUrl of previousPreviewUrls) {
      if (!previewUrls.includes(previewUrl)) {
        revokeBlobPreviewUrl(previewUrl);
      }
    }
    setAttachmentPreviewHandoffByMessageId((existing) => {
      const next = {
        ...existing,
        [messageId]: previewUrls,
      };
      attachmentPreviewHandoffByMessageIdRef.current = next;
      return next;
    });
  }, []);
  const serverMessages = activeThread?.messages;
  useEffect(() => {
    if (typeof Image === "undefined" || !serverMessages || serverMessages.length === 0) {
      return;
    }

    const cleanups: Array<() => void> = [];

    for (const [messageId, handoffPreviewUrls] of Object.entries(
      attachmentPreviewHandoffByMessageId,
    )) {
      if (attachmentPreviewPromotionInFlightByMessageIdRef.current[messageId]) {
        continue;
      }

      const serverMessage = serverMessages.find(
        (message) => message.id === messageId && message.role === "user",
      );
      if (!serverMessage?.attachments || serverMessage.attachments.length === 0) {
        continue;
      }

      const serverPreviewUrls = serverMessage.attachments.flatMap((attachment) =>
        attachment.type === "image" && attachment.previewUrl ? [attachment.previewUrl] : [],
      );
      if (
        serverPreviewUrls.length === 0 ||
        serverPreviewUrls.length !== handoffPreviewUrls.length ||
        serverPreviewUrls.some((previewUrl) => previewUrl.startsWith("blob:"))
      ) {
        continue;
      }

      attachmentPreviewPromotionInFlightByMessageIdRef.current[messageId] = true;

      let cancelled = false;
      const imageInstances: HTMLImageElement[] = [];

      const preloadServerPreviews = Promise.all(
        serverPreviewUrls.map(
          (previewUrl) =>
            new Promise<void>((resolve, reject) => {
              const image = new Image();
              imageInstances.push(image);
              const handleLoad = () => resolve();
              const handleError = () =>
                reject(new Error(`Failed to load server preview for ${messageId}.`));
              image.addEventListener("load", handleLoad, { once: true });
              image.addEventListener("error", handleError, { once: true });
              image.src = previewUrl;
            }),
        ),
      );

      void preloadServerPreviews
        .then(() => {
          if (cancelled) {
            return;
          }
          clearAttachmentPreviewHandoff(messageId as MessageId, handoffPreviewUrls);
        })
        .catch(() => {
          if (!cancelled) {
            delete attachmentPreviewPromotionInFlightByMessageIdRef.current[messageId];
          }
        });

      cleanups.push(() => {
        cancelled = true;
        delete attachmentPreviewPromotionInFlightByMessageIdRef.current[messageId];
        for (const image of imageInstances) {
          image.src = "";
        }
      });
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [attachmentPreviewHandoffByMessageId, clearAttachmentPreviewHandoff, serverMessages]);
  const timelineMessages = useMemo(() => {
    const messages = serverMessages ?? [];
    const serverMessagesWithPreviewHandoff =
      Object.keys(attachmentPreviewHandoffByMessageId).length === 0
        ? messages
        : // Spread only fires for the few messages that actually changed;
          // unchanged ones early-return their original reference.
          // In-place mutation would break React's immutable state contract.
          // oxlint-disable-next-line no-map-spread
          messages.map((message) => {
            if (
              message.role !== "user" ||
              !message.attachments ||
              message.attachments.length === 0
            ) {
              return message;
            }
            const handoffPreviewUrls = attachmentPreviewHandoffByMessageId[message.id];
            if (!handoffPreviewUrls || handoffPreviewUrls.length === 0) {
              return message;
            }

            let changed = false;
            let imageIndex = 0;
            const attachments = message.attachments.map((attachment) => {
              if (attachment.type !== "image") {
                return attachment;
              }
              const handoffPreviewUrl = handoffPreviewUrls[imageIndex];
              imageIndex += 1;
              if (!handoffPreviewUrl || attachment.previewUrl === handoffPreviewUrl) {
                return attachment;
              }
              changed = true;
              return {
                ...attachment,
                previewUrl: handoffPreviewUrl,
              };
            });

            return changed ? { ...message, attachments } : message;
          });

    if (optimisticUserMessages.length === 0) {
      return serverMessagesWithPreviewHandoff;
    }
    const serverIds = new Set(serverMessagesWithPreviewHandoff.map((message) => message.id));
    const pendingMessages = optimisticUserMessages.filter((message) => !serverIds.has(message.id));
    if (pendingMessages.length === 0) {
      return serverMessagesWithPreviewHandoff;
    }
    return [...serverMessagesWithPreviewHandoff, ...pendingMessages];
  }, [serverMessages, attachmentPreviewHandoffByMessageId, optimisticUserMessages]);
  const timelineEntries = useMemo(
    () =>
      deriveTimelineEntries(timelineMessages, activeThread?.proposedPlans ?? [], workLogEntries),
    [activeThread?.proposedPlans, timelineMessages, workLogEntries],
  );
  const { turnDiffSummaries, inferredCheckpointTurnCountByTurnId } =
    useTurnDiffSummaries(activeThread);
  const turnDiffSummaryByAssistantMessageId = useMemo(() => {
    const byMessageId = new Map<MessageId, TurnDiffSummary>();
    for (const summary of turnDiffSummaries) {
      if (!summary.assistantMessageId) continue;
      byMessageId.set(summary.assistantMessageId, summary);
    }
    return byMessageId;
  }, [turnDiffSummaries]);
  const revertTurnCountByUserMessageId = useMemo(() => {
    const byUserMessageId = new Map<MessageId, number>();
    for (let index = 0; index < timelineEntries.length; index += 1) {
      const entry = timelineEntries[index];
      if (!entry || entry.kind !== "message" || entry.message.role !== "user") {
        continue;
      }

      for (let nextIndex = index + 1; nextIndex < timelineEntries.length; nextIndex += 1) {
        const nextEntry = timelineEntries[nextIndex];
        if (!nextEntry || nextEntry.kind !== "message") {
          continue;
        }
        if (nextEntry.message.role === "user") {
          break;
        }
        const summary = turnDiffSummaryByAssistantMessageId.get(nextEntry.message.id);
        if (!summary) {
          continue;
        }
        const turnCount =
          summary.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[summary.turnId];
        if (typeof turnCount !== "number") {
          break;
        }
        byUserMessageId.set(entry.message.id, Math.max(0, turnCount - 1));
        break;
      }
    }

    return byUserMessageId;
  }, [inferredCheckpointTurnCountByTurnId, timelineEntries, turnDiffSummaryByAssistantMessageId]);

  const completionSummary = useMemo(() => {
    if (!latestTurnSettled) return null;
    if (!activeLatestTurn?.startedAt) return null;
    if (!activeLatestTurn.completedAt) return null;
    if (!latestTurnHasToolActivity) return null;

    const elapsed = formatElapsed(activeLatestTurn.startedAt, activeLatestTurn.completedAt);
    return elapsed ? `Worked for ${elapsed}` : null;
  }, [
    activeLatestTurn?.completedAt,
    activeLatestTurn?.startedAt,
    latestTurnHasToolActivity,
    latestTurnSettled,
  ]);
  const completionDividerBeforeEntryId = useMemo(() => {
    if (!latestTurnSettled) return null;
    if (!completionSummary) return null;
    return deriveCompletionDividerBeforeEntryId(timelineEntries, activeLatestTurn);
  }, [activeLatestTurn, completionSummary, latestTurnSettled, timelineEntries]);
  const gitCwd = activeProject
    ? projectScriptCwd({
        project: { cwd: activeProject.cwd },
        worktreePath: activeThread?.worktreePath ?? null,
      })
    : null;
  const gitStatusQuery = useVcsStatus({ environmentId, cwd: gitCwd });
  const keybindings = useServerKeybindings();
  const availableEditors = useServerAvailableEditors();
  // Prefer an instance-id match so a custom Codex instance (e.g.
  // `codex_personal`) surfaces its own status/message in the banner rather
  // than the default Codex's. Falls back to first-match-by-kind when no
  // saved instance id is available or the instance no longer exists.
  const activeProviderInstanceId =
    activeThread?.session?.providerInstanceId ??
    activeThread?.modelSelection.instanceId ??
    activeProject?.defaultModelSelection?.instanceId ??
    null;
  const activeProviderStatus = useMemo(() => {
    if (activeProviderInstanceId) {
      return (
        providerStatusesForChat.find((status) => status.instanceId === activeProviderInstanceId) ??
        null
      );
    }
    const defaultInstanceId = defaultInstanceIdForDriver(selectedProvider);
    return (
      providerStatusesForChat.find((status) => status.instanceId === defaultInstanceId) ?? null
    );
  }, [activeProviderInstanceId, providerStatusesForChat, selectedProvider]);
  // Default true while loading to avoid toolbar flicker.
  const isGitRepo = gitStatusQuery.data?.isRepo ?? true;
  const terminalShortcutLabelOptions = useMemo(
    () => ({
      context: {
        terminalFocus: true,
        terminalOpen: Boolean(terminalState.terminalOpen),
      },
    }),
    [terminalState.terminalOpen],
  );
  const nonTerminalShortcutLabelOptions = useMemo(
    () => ({
      context: {
        terminalFocus: false,
        terminalOpen: Boolean(terminalState.terminalOpen),
      },
    }),
    [terminalState.terminalOpen],
  );
  const splitTerminalShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "terminal.split", terminalShortcutLabelOptions),
    [keybindings, terminalShortcutLabelOptions],
  );
  const newTerminalShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "terminal.new", terminalShortcutLabelOptions),
    [keybindings, terminalShortcutLabelOptions],
  );
  const closeTerminalShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "terminal.close", terminalShortcutLabelOptions),
    [keybindings, terminalShortcutLabelOptions],
  );
  const newThreadShortcutLabelOptions = useMemo(
    () => ({
      context: {
        terminalFocus: false,
        terminalOpen: false,
      },
    }),
    [],
  );
  const aiPaneNewThreadShortcutLabel = useMemo(
    () =>
      shortcutLabelForCommand(keybindings, "chat.newLocal", newThreadShortcutLabelOptions) ??
      shortcutLabelForCommand(keybindings, "chat.new", newThreadShortcutLabelOptions),
    [keybindings, newThreadShortcutLabelOptions],
  );
  const activeTerminalLaunchContext =
    terminalLaunchContext?.threadId === activeThreadId ? terminalLaunchContext : null;
  const diffPanelShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "diff.toggle", nonTerminalShortcutLabelOptions),
    [keybindings, nonTerminalShortcutLabelOptions],
  );
  const onToggleDiff = useCallback(() => {
    if (!isServerThread) {
      return;
    }
    if (!diffOpen) {
      onDiffPanelOpen?.();
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: {
        environmentId,
        threadId,
      },
      replace: true,
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return diffOpen ? { ...rest, diff: undefined } : { ...rest, diff: "1" };
      },
    });
  }, [diffOpen, environmentId, isServerThread, navigate, onDiffPanelOpen, threadId]);
  const handleWorkspaceAiPaneThreadChange = useCallback(
    (paneId: string, nextThreadKey: string | null, options?: { title?: string }) => {
      if (nextThreadKey === null) {
        clearWorkspaceAiPaneThreadBinding(paneId);
        return;
      }
      const nextThreadRef = parseScopedThreadKey(nextThreadKey);
      if (!nextThreadRef) {
        return;
      }
      const nextThread = activeWorkspaceThreadOptions.find(
        (thread) =>
          scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) === nextThreadKey,
      );
      const currentPane = useUiStateStore
        .getState()
        .workspaceThreadLayoutById[workspaceLayoutKey]?.panes?.find(
          (pane) => pane.paneId === paneId && pane.type === "ai",
        );
      if (!currentPane) {
        return;
      }
      setWorkspaceAiPaneThreadBinding(
        paneId,
        nextThreadRef,
        options?.title ?? nextThread?.title ?? currentPane.title,
      );
    },
    [
      activeWorkspaceThreadOptions,
      clearWorkspaceAiPaneThreadBinding,
      setWorkspaceAiPaneThreadBinding,
      workspaceLayoutKey,
    ],
  );
  const handleAiPaneThreadChange = useCallback(
    (nextThreadKey: string | null) => {
      if (nextThreadKey === null || nextThreadKey === activeThreadKey) {
        return;
      }
      if (onWorkspaceAiPaneThreadChange) {
        onWorkspaceAiPaneThreadChange(nextThreadKey);
        return;
      }
      handleWorkspaceAiPaneThreadChange("ai", nextThreadKey);
    },
    [activeThreadKey, handleWorkspaceAiPaneThreadChange, onWorkspaceAiPaneThreadChange],
  );
  const envLocked = Boolean(
    activeThread &&
    (activeThread.messages.length > 0 ||
      (activeThread.session !== null && activeThread.session.status !== "closed")),
  );

  // Handle environment change for draft threads.  When the user picks a
  // different environment we update the draft context to point at the physical
  // project in that environment while keeping the same logical project.
  const onEnvironmentChange = useCallback(
    (nextEnvironmentId: EnvironmentId) => {
      if (envLocked || !draftId) return;
      const target = logicalProjectEnvironments.find(
        (env) => env.environmentId === nextEnvironmentId,
      );
      if (!target) return;
      setDraftThreadContext(draftId, {
        projectRef: scopeProjectRef(target.environmentId, target.projectId),
      });
    },
    [draftId, envLocked, logicalProjectEnvironments, setDraftThreadContext],
  );

  const activeTerminalGroup =
    terminalState.terminalGroups.find(
      (group) => group.id === terminalState.activeTerminalGroupId,
    ) ??
    terminalState.terminalGroups.find((group) =>
      group.terminalIds.includes(terminalState.activeTerminalId),
    ) ??
    null;
  useEffect(() => {
    if (!activeThreadEnvironmentId || !activeThreadId || !activeThreadTitle) {
      return;
    }
    const terminalTitle = activeTerminalGroup
      ? (basenameOfPanePath(activeWorkspaceRoot) ?? "Terminal")
      : "Terminal";
    storeEnsureWorkspaceThreadDockedPaneLayout(workspaceLayoutKey, {
      threadId: activeThreadId,
      environmentId: activeThreadEnvironmentId,
      cwd: activeWorkspaceRoot,
      aiTitle: activeThreadTitle,
      editorTitle: resolveEditorPaneDefaultTitle(workspaceName, activeWorkspaceRoot),
      terminalTitle,
      editorActivePath: null,
      terminalId: DEFAULT_THREAD_TERMINAL_ID,
      terminalGroupId: `group-${DEFAULT_THREAD_TERMINAL_ID}`,
    });
  }, [
    activeTerminalGroup,
    activeThreadEnvironmentId,
    activeThreadId,
    activeThreadTitle,
    activeWorkspaceRoot,
    storeEnsureWorkspaceThreadDockedPaneLayout,
    workspaceLayoutKey,
    workspaceName,
  ]);
  const hasReachedSplitLimit =
    (activeTerminalGroup?.terminalIds.length ?? 0) >= MAX_TERMINALS_PER_GROUP;
  const setThreadError = useCallback(
    (targetThreadId: ThreadId | null, error: string | null) => {
      if (!targetThreadId) return;
      const nextError = sanitizeThreadErrorMessage(error);
      const isCurrentServerThread = shouldWriteThreadErrorToCurrentServerThread({
        serverThread,
        routeThreadRef,
        targetThreadId,
      });
      if (isCurrentServerThread) {
        setStoreThreadError(targetThreadId, nextError);
        return;
      }
      const localDraftErrorKey = draftId ?? targetThreadId;
      setLocalDraftErrorsByDraftId((existing) => {
        if ((existing[localDraftErrorKey] ?? null) === nextError) {
          return existing;
        }
        return {
          ...existing,
          [localDraftErrorKey]: nextError,
        };
      });
    },
    [draftId, routeThreadRef, serverThread, setStoreThreadError],
  );

  const focusComposer = useCallback(() => {
    composerRef.current?.focusAtEnd();
  }, []);
  const scheduleComposerFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      focusComposer();
    });
  }, [focusComposer]);
  const addTerminalContextToDraft = useCallback((selection: TerminalContextSelection) => {
    composerRef.current?.addTerminalContext(selection);
  }, []);
  const setTerminalOpen = useCallback(
    (open: boolean) => {
      if (!activeThreadRef) return;
      if (open) {
        storeRestoreWorkspaceThreadDefaultDockedPane(workspaceLayoutKey, "terminal");
      }
      storeSetTerminalOpen(activeThreadRef, open);
      storeSetWorkspaceThreadLastActivePane(workspaceLayoutKey, open ? "terminal" : "ai");
    },
    [
      activeThreadRef,
      storeRestoreWorkspaceThreadDefaultDockedPane,
      storeSetTerminalOpen,
      storeSetWorkspaceThreadLastActivePane,
      workspaceLayoutKey,
    ],
  );
  const splitTerminal = useCallback(() => {
    if (!activeThreadRef || hasReachedSplitLimit) return;
    const terminalId = `terminal-${randomUUID()}`;
    storeSplitTerminal(activeThreadRef, terminalId);
    storeSetWorkspaceThreadLastActivePane(workspaceLayoutKey, "terminal");
    setTerminalFocusRequestId((value) => value + 1);
  }, [
    activeThreadRef,
    hasReachedSplitLimit,
    storeSetWorkspaceThreadLastActivePane,
    storeSplitTerminal,
    workspaceLayoutKey,
  ]);
  const splitWorkspaceTerminalPane = useCallback(
    (
      targetThreadRef: ScopedThreadRef | null,
      terminalGroupId: string,
      anchorTerminalId: string,
    ) => {
      if (!targetThreadRef) return;
      const terminalId = `terminal-${randomUUID()}`;
      storeSplitTerminal(targetThreadRef, terminalId, {
        groupId: terminalGroupId,
        anchorTerminalId,
      });
      storeSetWorkspaceThreadLastActivePane(workspaceLayoutKey, "terminal");
      setTerminalFocusRequestId((value) => value + 1);
    },
    [storeSetWorkspaceThreadLastActivePane, storeSplitTerminal, workspaceLayoutKey],
  );
  const activeWorkspaceTerminalPane = workspaceDockedPanes.find(
    (pane): pane is Extract<PersistedWorkspaceDockedPane, { type: "terminal" }> =>
      pane.type === "terminal" &&
      (pane.metadata.terminalGroupId === activeTerminalGroup?.id ||
        pane.metadata.terminalId === terminalState.activeTerminalId),
  );
  const createNewWorkspaceTerminalPane = useCallback(
    (pane?: Extract<PersistedWorkspaceDockedPane, { type: "terminal" }>) => {
      if (!activeThread || !activeThreadKey || !activeThreadRef) {
        return;
      }
      const targetThreadRef =
        pane?.metadata.threadId && pane.environmentId
          ? scopeThreadRef(
              pane.environmentId as EnvironmentId,
              ThreadId.make(pane.metadata.threadId),
            )
          : activeThreadRef;
      const terminalId = `terminal-${randomUUID()}`;
      const terminalGroupId = `group-${terminalId}`;
      const cwd = pane?.cwd ?? activeWorkspaceRoot ?? activeProjectCwd ?? "";

      storeNewTerminal(targetThreadRef, terminalId);
      storeSetTerminalOpen(targetThreadRef, true);
      storeAddWorkspaceThreadDockedPane(workspaceLayoutKey, {
        paneId: `terminal:${randomUUID()}`,
        type: "terminal",
        title: resolvePaneDefaultTitle("terminal", cwd, workspaceName),
        environmentId: targetThreadRef.environmentId,
        cwd,
        threadId: targetThreadRef.threadId,
        terminalId,
        terminalGroupId,
      });
      storeSetWorkspaceThreadLastActivePane(workspaceLayoutKey, "terminal");
      setTerminalFocusRequestId((value) => value + 1);
    },
    [
      activeProjectCwd,
      activeThread,
      activeThreadKey,
      activeThreadRef,
      activeWorkspaceRoot,
      storeAddWorkspaceThreadDockedPane,
      storeNewTerminal,
      storeSetTerminalOpen,
      storeSetWorkspaceThreadLastActivePane,
      workspaceLayoutKey,
      workspaceName,
    ],
  );
  const createNewTerminalPane = useCallback(() => {
    createNewWorkspaceTerminalPane(activeWorkspaceTerminalPane);
  }, [activeWorkspaceTerminalPane, createNewWorkspaceTerminalPane]);
  const markEditorActive = useCallback(() => {
    if (!activeThreadRef) return;
    storeSetWorkspaceThreadLastActivePane(workspaceLayoutKey, "editor");
  }, [activeThreadRef, storeSetWorkspaceThreadLastActivePane, workspaceLayoutKey]);
  const onOpenChangedFileInEditor = useCallback(
    (filePath: string) => {
      markEditorActive();
      setEditorOpenFileRequest((currentRequest) => ({
        id: (currentRequest?.id ?? 0) + 1,
        path: filePath,
      }));
    },
    [markEditorActive],
  );
  const persistWorkspaceEditorPaneState = useCallback(
    (state: EditorWorkspaceStateChange) => {
      const layout = useUiStateStore.getState().workspaceThreadLayoutById[workspaceLayoutKey];
      if (!layout?.panes) {
        return;
      }
      const panes = applyWorkspaceEditorPaneState({
        panes: layout.panes,
        environmentId: state.environmentId,
        workspaceRoot: state.workspaceRoot,
        state,
      });
      if (panes !== layout.panes) {
        storeSetWorkspaceThreadDockedPanes(workspaceLayoutKey, panes);
      }
    },
    [storeSetWorkspaceThreadDockedPanes, workspaceLayoutKey],
  );
  const closeTerminal = useCallback(
    (
      terminalId: string,
      targetThreadRef: ScopedThreadRef | null = activeThreadRef,
      terminalCount = terminalState.terminalIds.length,
    ) => {
      if (!targetThreadRef) return;
      const api = readEnvironmentApi(targetThreadRef.environmentId);
      if (!api) return;
      const isFinalTerminal = terminalCount <= 1;
      const fallbackExitWrite = () =>
        api.terminal
          .write({ threadId: targetThreadRef.threadId, terminalId, data: "exit\n" })
          .catch(() => undefined);
      if ("close" in api.terminal && typeof api.terminal.close === "function") {
        void (async () => {
          if (isFinalTerminal) {
            await api.terminal
              .clear({ threadId: targetThreadRef.threadId, terminalId })
              .catch(() => undefined);
          }
          await api.terminal.close({
            threadId: targetThreadRef.threadId,
            terminalId,
            deleteHistory: true,
          });
        })().catch(() => fallbackExitWrite());
      } else {
        void fallbackExitWrite();
      }
      storeCloseTerminal(targetThreadRef, terminalId);
      setTerminalFocusRequestId((value) => value + 1);
    },
    [activeThreadRef, storeCloseTerminal, terminalState.terminalIds.length],
  );
  const closeWorkspaceTerminalPane = useCallback(
    (
      pane: Extract<PersistedWorkspaceDockedPane, { type: "terminal" }>,
      terminalGroup: ThreadTerminalGroup,
      terminalId: string,
    ) => {
      const targetThreadRef =
        pane.metadata.threadId && pane.environmentId
          ? scopeThreadRef(
              pane.environmentId as EnvironmentId,
              ThreadId.make(pane.metadata.threadId),
            )
          : activeThreadRef;
      const targetTerminalState = targetThreadRef
        ? selectThreadTerminalUiState(
            useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
            targetThreadRef,
          )
        : null;
      closeTerminal(terminalId, targetThreadRef, targetTerminalState?.terminalIds.length ?? 1);
      if (shouldRemoveTerminalPaneAfterClose(terminalGroup.terminalIds, terminalId)) {
        storeRemoveWorkspaceThreadDockedPane(workspaceLayoutKey, pane.paneId);
      }
    },
    [activeThreadRef, closeTerminal, storeRemoveWorkspaceThreadDockedPane, workspaceLayoutKey],
  );
  const closeActiveWorkspaceTerminal = useCallback(() => {
    if (!activeTerminalGroup || !activeWorkspaceTerminalPane) {
      closeTerminal(terminalState.activeTerminalId);
      return;
    }
    closeWorkspaceTerminalPane(
      activeWorkspaceTerminalPane,
      activeTerminalGroup,
      terminalState.activeTerminalId,
    );
  }, [
    activeTerminalGroup,
    activeWorkspaceTerminalPane,
    closeTerminal,
    closeWorkspaceTerminalPane,
    terminalState.activeTerminalId,
  ]);
  const removeWorkspacePane = useCallback(
    (paneId: string) => {
      storeRemoveWorkspaceThreadDockedPane(workspaceLayoutKey, paneId);
    },
    [storeRemoveWorkspaceThreadDockedPane, workspaceLayoutKey],
  );
  const deleteActiveAiPaneThread = useCallback(async () => {
    if (!isServerThread || !activeThreadRef) {
      return;
    }
    try {
      const deleted = await confirmAndDeleteThread(activeThreadRef);
      if (!deleted || !onWorkspaceAiPaneThreadChange) {
        return;
      }
      if (!fallbackWorkspaceThread) {
        onWorkspaceAiPaneThreadChange(null, { title: "AI" });
        return;
      }
      const fallbackThreadRef = scopeThreadRef(
        fallbackWorkspaceThread.environmentId,
        fallbackWorkspaceThread.id,
      );
      onWorkspaceAiPaneThreadChange(scopedThreadKey(fallbackThreadRef), {
        title: fallbackWorkspaceThread.title,
      });
    } catch (error) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to delete thread",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    }
  }, [
    activeThreadRef,
    confirmAndDeleteThread,
    fallbackWorkspaceThread,
    isServerThread,
    onWorkspaceAiPaneThreadChange,
  ]);
  const runProjectScript = useCallback(
    async (
      script: ProjectScript,
      options?: {
        cwd?: string;
        env?: Record<string, string>;
        worktreePath?: string | null;
        preferNewTerminal?: boolean;
        rememberAsLastInvoked?: boolean;
      },
    ) => {
      const api = readEnvironmentApi(environmentId);
      if (!api || !activeThreadId || !activeProject || !activeThread) return;
      if (options?.rememberAsLastInvoked !== false) {
        setLastInvokedScriptByProjectId((current) => {
          if (current[activeProject.id] === script.id) return current;
          return { ...current, [activeProject.id]: script.id };
        });
      }
      const targetCwd = options?.cwd ?? gitCwd ?? activeProject.cwd;
      const baseTerminalId =
        terminalState.activeTerminalId ||
        terminalState.terminalIds[0] ||
        DEFAULT_THREAD_TERMINAL_ID;
      const isBaseTerminalBusy = runningTerminalIds.includes(baseTerminalId);
      const wantsNewTerminal = Boolean(options?.preferNewTerminal) || isBaseTerminalBusy;
      const shouldCreateNewTerminal = wantsNewTerminal;
      const targetTerminalId = shouldCreateNewTerminal
        ? `terminal-${randomUUID()}`
        : baseTerminalId;
      const targetWorktreePath = options?.worktreePath ?? activeThread.worktreePath ?? null;

      setTerminalLaunchContext({
        threadId: activeThreadId,
        cwd: targetCwd,
        worktreePath: targetWorktreePath,
      });
      setTerminalOpen(true);
      if (!activeThreadRef) {
        return;
      }
      if (shouldCreateNewTerminal) {
        storeNewTerminal(activeThreadRef, targetTerminalId);
      } else {
        storeSetActiveTerminal(activeThreadRef, targetTerminalId);
      }
      setTerminalFocusRequestId((value) => value + 1);

      const runtimeEnv = projectScriptRuntimeEnv({
        project: {
          cwd: activeProject.cwd,
        },
        worktreePath: targetWorktreePath,
        ...(options?.env ? { extraEnv: options.env } : {}),
      });
      const openTerminalInput: TerminalOpenInput = shouldCreateNewTerminal
        ? {
            threadId: activeThreadId,
            terminalId: targetTerminalId,
            cwd: targetCwd,
            ...(targetWorktreePath !== null ? { worktreePath: targetWorktreePath } : {}),
            env: runtimeEnv,
            cols: SCRIPT_TERMINAL_COLS,
            rows: SCRIPT_TERMINAL_ROWS,
          }
        : {
            threadId: activeThreadId,
            terminalId: targetTerminalId,
            cwd: targetCwd,
            ...(targetWorktreePath !== null ? { worktreePath: targetWorktreePath } : {}),
            env: runtimeEnv,
          };

      try {
        await api.terminal.open(openTerminalInput);
        await api.terminal.write({
          threadId: activeThreadId,
          terminalId: targetTerminalId,
          data: `${script.command}\r`,
        });
      } catch (error) {
        setThreadError(
          activeThreadId,
          error instanceof Error ? error.message : `Failed to run script "${script.name}".`,
        );
      }
    },
    [
      activeProject,
      activeThread,
      activeThreadId,
      activeThreadRef,
      gitCwd,
      setTerminalOpen,
      setThreadError,
      storeNewTerminal,
      storeSetActiveTerminal,
      setLastInvokedScriptByProjectId,
      environmentId,
      terminalState.activeTerminalId,
      terminalState.terminalIds,
      runningTerminalIds,
    ],
  );

  const persistProjectScripts = useCallback(
    async (input: {
      projectId: ProjectId;
      projectCwd: string;
      previousScripts: ProjectScript[];
      nextScripts: ProjectScript[];
      keybinding?: string | null;
      keybindingCommand: KeybindingCommand;
    }) => {
      const api = readEnvironmentApi(environmentId);
      if (!api) return;

      await api.orchestration.dispatchCommand({
        type: "project.meta.update",
        commandId: newCommandId(),
        projectId: input.projectId,
        scripts: input.nextScripts,
      });

      const keybindingRule = decodeProjectScriptKeybindingRule({
        keybinding: input.keybinding,
        command: input.keybindingCommand,
      });

      if (isElectron && keybindingRule) {
        const localApi = readLocalApi();
        if (!localApi) {
          throw new Error("Local API unavailable.");
        }
        await localApi.server.upsertKeybinding(keybindingRule);
      }
    },
    [environmentId],
  );
  const saveProjectScript = useCallback(
    async (input: NewProjectScriptInput) => {
      if (!activeProject) return;
      const nextId = nextProjectScriptId(
        input.name,
        activeProject.scripts.map((script) => script.id),
      );
      const nextScript: ProjectScript = {
        id: nextId,
        name: input.name,
        command: input.command,
        icon: input.icon,
        runOnWorktreeCreate: input.runOnWorktreeCreate,
      };
      const nextScripts = input.runOnWorktreeCreate
        ? [
            ...activeProject.scripts.map((script) =>
              script.runOnWorktreeCreate ? { ...script, runOnWorktreeCreate: false } : script,
            ),
            nextScript,
          ]
        : [...activeProject.scripts, nextScript];

      await persistProjectScripts({
        projectId: activeProject.id,
        projectCwd: activeProject.cwd,
        previousScripts: activeProject.scripts,
        nextScripts,
        keybinding: input.keybinding,
        keybindingCommand: commandForProjectScript(nextId),
      });
    },
    [activeProject, persistProjectScripts],
  );
  const updateProjectScript = useCallback(
    async (scriptId: string, input: NewProjectScriptInput) => {
      if (!activeProject) return;
      const existingScript = activeProject.scripts.find((script) => script.id === scriptId);
      if (!existingScript) {
        throw new Error("Script not found.");
      }

      const updatedScript: ProjectScript = {
        ...existingScript,
        name: input.name,
        command: input.command,
        icon: input.icon,
        runOnWorktreeCreate: input.runOnWorktreeCreate,
      };
      const nextScripts = activeProject.scripts.map((script) =>
        script.id === scriptId
          ? updatedScript
          : input.runOnWorktreeCreate
            ? { ...script, runOnWorktreeCreate: false }
            : script,
      );

      await persistProjectScripts({
        projectId: activeProject.id,
        projectCwd: activeProject.cwd,
        previousScripts: activeProject.scripts,
        nextScripts,
        keybinding: input.keybinding,
        keybindingCommand: commandForProjectScript(scriptId),
      });
    },
    [activeProject, persistProjectScripts],
  );
  const deleteProjectScript = useCallback(
    async (scriptId: string) => {
      if (!activeProject) return;
      const nextScripts = activeProject.scripts.filter((script) => script.id !== scriptId);

      const deletedName = activeProject.scripts.find((s) => s.id === scriptId)?.name;

      try {
        await persistProjectScripts({
          projectId: activeProject.id,
          projectCwd: activeProject.cwd,
          previousScripts: activeProject.scripts,
          nextScripts,
          keybinding: null,
          keybindingCommand: commandForProjectScript(scriptId),
        });
        toastManager.add({
          type: "success",
          title: `Deleted action "${deletedName ?? "Unknown"}"`,
        });
      } catch (error) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not delete action",
            description: error instanceof Error ? error.message : "An unexpected error occurred.",
          }),
        );
      }
    },
    [activeProject, persistProjectScripts],
  );

  const handleRuntimeModeChange = useCallback(
    (mode: RuntimeMode) => {
      if (mode === runtimeMode) return;
      setComposerDraftRuntimeMode(composerDraftTarget, mode);
      if (isLocalDraftThread) {
        setDraftThreadContext(composerDraftTarget, { runtimeMode: mode });
      }
      scheduleComposerFocus();
    },
    [
      isLocalDraftThread,
      runtimeMode,
      scheduleComposerFocus,
      composerDraftTarget,
      setComposerDraftRuntimeMode,
      setDraftThreadContext,
    ],
  );

  const handleInteractionModeChange = useCallback(
    (mode: ProviderInteractionMode) => {
      if (mode === interactionMode) return;
      setComposerDraftInteractionMode(composerDraftTarget, mode);
      if (isLocalDraftThread) {
        setDraftThreadContext(composerDraftTarget, { interactionMode: mode });
      }
      scheduleComposerFocus();
    },
    [
      interactionMode,
      isLocalDraftThread,
      scheduleComposerFocus,
      composerDraftTarget,
      setComposerDraftInteractionMode,
      setDraftThreadContext,
    ],
  );
  const toggleInteractionMode = useCallback(() => {
    handleInteractionModeChange(interactionMode === "plan" ? "default" : "plan");
  }, [handleInteractionModeChange, interactionMode]);
  const togglePlanSidebar = useCallback(() => {
    setPlanSidebarOpen((open) => {
      if (open) {
        planSidebarDismissedForTurnRef.current =
          activePlan?.turnId ?? sidebarProposedPlan?.turnId ?? "__dismissed__";
      } else {
        planSidebarDismissedForTurnRef.current = null;
      }
      return !open;
    });
  }, [activePlan?.turnId, setPlanSidebarOpen, sidebarProposedPlan?.turnId]);
  const closePlanSidebar = useCallback(() => {
    setPlanSidebarOpen(false);
    planSidebarDismissedForTurnRef.current =
      activePlan?.turnId ?? sidebarProposedPlan?.turnId ?? "__dismissed__";
  }, [activePlan?.turnId, setPlanSidebarOpen, sidebarProposedPlan?.turnId]);

  const persistThreadSettingsForNextTurn = useCallback(
    async (input: {
      threadId: ThreadId;
      createdAt: string;
      modelSelection?: ModelSelection;
      runtimeMode: RuntimeMode;
      interactionMode: ProviderInteractionMode;
    }) => {
      if (!serverThread) {
        return;
      }
      const api = readEnvironmentApi(environmentId);
      if (!api) {
        return;
      }

      if (
        input.modelSelection !== undefined &&
        (input.modelSelection.model !== serverThread.modelSelection.model ||
          input.modelSelection.instanceId !== serverThread.modelSelection.instanceId ||
          JSON.stringify(input.modelSelection.options ?? null) !==
            JSON.stringify(serverThread.modelSelection.options ?? null))
      ) {
        await api.orchestration.dispatchCommand({
          type: "thread.meta.update",
          commandId: newCommandId(),
          threadId: input.threadId,
          modelSelection: input.modelSelection,
        });
      }

      if (input.runtimeMode !== serverThread.runtimeMode) {
        await api.orchestration.dispatchCommand({
          type: "thread.runtime-mode.set",
          commandId: newCommandId(),
          threadId: input.threadId,
          runtimeMode: input.runtimeMode,
          createdAt: input.createdAt,
        });
      }

      if (input.interactionMode !== serverThread.interactionMode) {
        await api.orchestration.dispatchCommand({
          type: "thread.interaction-mode.set",
          commandId: newCommandId(),
          threadId: input.threadId,
          interactionMode: input.interactionMode,
          createdAt: input.createdAt,
        });
      }
    },
    [environmentId, serverThread],
  );

  // Scroll helpers — LegendList handles auto-scroll via maintainScrollAtEnd.
  const scrollToEnd = useCallback((animated = false) => {
    legendListRef.current?.scrollToEnd?.({ animated });
  }, []);

  // Debounce *showing* the scroll-to-bottom pill so it doesn't flash during
  // thread switches.  LegendList fires scroll events with isAtEnd=false while
  // initialScrollAtEnd is settling; hiding is always immediate.
  const showScrollDebouncer = useRef(
    new Debouncer(() => setShowScrollToBottom(true), { wait: 150 }),
  );
  const onIsAtEndChange = useCallback((isAtEnd: boolean) => {
    if (isAtEndRef.current === isAtEnd) return;
    isAtEndRef.current = isAtEnd;
    if (isAtEnd) {
      showScrollDebouncer.current.cancel();
      setShowScrollToBottom(false);
    } else {
      showScrollDebouncer.current.maybeExecute();
    }
  }, []);

  useEffect(() => {
    setPullRequestDialogState(null);
    isAtEndRef.current = true;
    showScrollDebouncer.current.cancel();
    setShowScrollToBottom(false);
    if (planSidebarOpenOnNextThreadRef.current) {
      planSidebarOpenOnNextThreadRef.current = false;
      setPlanSidebarOpen(true);
    } else {
      planSidebarOpenOnNextThreadRef.current = false;
    }
    planSidebarDismissedForTurnRef.current = null;
  }, [activeThread?.id, setPlanSidebarOpen]);

  // Auto-open the plan sidebar when plan/todo steps arrive for the current turn.
  // Don't auto-open for plans carried over from a previous turn (the user can open manually).
  useEffect(() => {
    if (!autoOpenPlanSidebar) return;
    if (!activePlan) return;
    if (planSidebarOpen) return;
    const latestTurnId = activeLatestTurn?.turnId ?? null;
    if (latestTurnId && activePlan.turnId !== latestTurnId) return;
    const turnKey = activePlan.turnId ?? sidebarProposedPlan?.turnId ?? "__dismissed__";
    if (planSidebarDismissedForTurnRef.current === turnKey) return;
    setPlanSidebarOpen(true);
  }, [
    activePlan,
    activeLatestTurn?.turnId,
    autoOpenPlanSidebar,
    planSidebarOpen,
    setPlanSidebarOpen,
    sidebarProposedPlan?.turnId,
  ]);

  useEffect(() => {
    setIsRevertingCheckpoint(false);
  }, [activeThread?.id]);

  useEffect(() => {
    if (!activeThread?.id || terminalState.terminalOpen) return;
    const frame = window.requestAnimationFrame(() => {
      focusComposer();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeThread?.id, focusComposer, terminalState.terminalOpen]);

  useEffect(() => {
    if (!activeThread?.id) return;
    if (activeThread.messages.length === 0) {
      return;
    }
    const serverIds = new Set(activeThread.messages.map((message) => message.id));
    const removedMessages = optimisticUserMessages.filter((message) => serverIds.has(message.id));
    if (removedMessages.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setOptimisticUserMessages((existing) =>
        existing.filter((message) => !serverIds.has(message.id)),
      );
    }, 0);
    for (const removedMessage of removedMessages) {
      const previewUrls = collectUserMessageBlobPreviewUrls(removedMessage);
      if (previewUrls.length > 0) {
        handoffAttachmentPreviews(removedMessage.id, previewUrls);
        continue;
      }
      revokeUserMessagePreviewUrls(removedMessage);
    }
    return () => {
      window.clearTimeout(timer);
    };
  }, [activeThread?.id, activeThread?.messages, handoffAttachmentPreviews, optimisticUserMessages]);

  useEffect(() => {
    setOptimisticUserMessages((existing) => {
      for (const message of existing) {
        revokeUserMessagePreviewUrls(message);
      }
      return [];
    });
    resetLocalDispatch();
    setExpandedImage(null);
  }, [draftId, resetLocalDispatch, threadId]);

  const closeExpandedImage = useCallback(() => {
    setExpandedImage(null);
  }, []);

  const activeWorktreePath = activeThread?.worktreePath ?? null;
  const derivedEnvMode: DraftThreadEnvMode = resolveEffectiveEnvMode({
    activeWorktreePath,
    hasServerThread: isServerThread,
    draftThreadEnvMode: isLocalDraftThread ? draftThread?.envMode : undefined,
  });
  const canOverrideServerThreadEnvMode = Boolean(
    isServerThread &&
    activeThread &&
    activeThread.messages.length === 0 &&
    activeThread.worktreePath === null &&
    !envLocked,
  );
  const envMode: DraftThreadEnvMode = canOverrideServerThreadEnvMode
    ? (pendingServerThreadEnvMode ?? draftThread?.envMode ?? derivedEnvMode)
    : derivedEnvMode;
  const activeThreadBranch =
    canOverrideServerThreadEnvMode && pendingServerThreadBranch !== undefined
      ? pendingServerThreadBranch
      : (activeThread?.branch ?? null);
  const sendEnvMode = resolveSendEnvMode({
    requestedEnvMode: envMode,
    isGitRepo,
  });

  useEffect(() => {
    setPendingServerThreadEnvMode(null);
    setPendingServerThreadBranch(undefined);
  }, [activeThread?.id]);

  useEffect(() => {
    if (canOverrideServerThreadEnvMode) {
      return;
    }
    setPendingServerThreadEnvMode(null);
    setPendingServerThreadBranch(undefined);
  }, [canOverrideServerThreadEnvMode]);

  useEffect(() => {
    if (!activeThreadId) {
      setTerminalLaunchContext(null);
      return;
    }
    setTerminalLaunchContext((current) => {
      if (!current) return current;
      if (current.threadId === activeThreadId) return current;
      return null;
    });
  }, [activeThreadId]);

  useEffect(() => {
    if (!activeThreadId || !activeProjectCwd) {
      return;
    }
    setTerminalLaunchContext((current) => {
      if (!current || current.threadId !== activeThreadId) {
        return current;
      }
      const settledCwd = projectScriptCwd({
        project: { cwd: activeProjectCwd },
        worktreePath: activeThreadWorktreePath,
      });
      if (
        settledCwd === current.cwd &&
        (activeThreadWorktreePath ?? null) === current.worktreePath
      ) {
        return null;
      }
      return current;
    });
  }, [activeProjectCwd, activeThreadId, activeThreadWorktreePath]);

  useEffect(() => {
    if (terminalState.terminalOpen) {
      return;
    }
    setTerminalLaunchContext((current) => (current?.threadId === activeThreadId ? null : current));
  }, [activeThreadId, terminalState.terminalOpen]);

  useEffect(() => {
    if (!activeThreadKey) return;
    const previous = terminalOpenByThreadRef.current[activeThreadKey] ?? false;
    const current = Boolean(terminalState.terminalOpen);

    if (!previous && current) {
      terminalOpenByThreadRef.current[activeThreadKey] = current;
      setTerminalFocusRequestId((value) => value + 1);
      return;
    } else if (previous && !current) {
      terminalOpenByThreadRef.current[activeThreadKey] = current;
      const frame = window.requestAnimationFrame(() => {
        focusComposer();
      });
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    terminalOpenByThreadRef.current[activeThreadKey] = current;
  }, [activeThreadKey, focusComposer, terminalState.terminalOpen]);

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (!activeThreadId || useCommandPaletteStore.getState().open || event.defaultPrevented) {
        return;
      }
      const shortcutContext = {
        terminalFocus: isTerminalFocused(),
        terminalOpen: Boolean(terminalState.terminalOpen),
        modelPickerOpen: composerRef.current?.isModelPickerOpen() ?? false,
      };

      const command = resolveShortcutCommand(event, keybindings, {
        context: shortcutContext,
      });
      if (!command) return;

      if (
        (command === "chat.new" || command === "chat.newLocal") &&
        aiPaneRootRef.current &&
        event.target instanceof Node &&
        aiPaneRootRef.current.contains(event.target)
      ) {
        event.preventDefault();
        event.stopPropagation();
        void createScopedAiPaneThread(command === "chat.new" ? "contextual" : "default");
        return;
      }

      if (command === "terminal.split") {
        event.preventDefault();
        event.stopPropagation();
        if (!terminalState.terminalOpen) {
          setTerminalOpen(true);
        }
        splitTerminal();
        return;
      }

      if (command === "terminal.close") {
        event.preventDefault();
        event.stopPropagation();
        if (!terminalState.terminalOpen) return;
        closeActiveWorkspaceTerminal();
        return;
      }

      if (command === "terminal.new") {
        event.preventDefault();
        event.stopPropagation();
        if (!terminalState.terminalOpen) {
          setTerminalOpen(true);
        }
        createNewTerminalPane();
        return;
      }

      if (command === "diff.toggle") {
        event.preventDefault();
        event.stopPropagation();
        onToggleDiff();
        return;
      }

      if (command === "modelPicker.toggle") {
        event.preventDefault();
        event.stopPropagation();
        composerRef.current?.toggleModelPicker();
        return;
      }

      const scriptId = projectScriptIdFromCommand(command);
      if (!scriptId || !activeProject) return;
      const script = activeProject.scripts.find((entry) => entry.id === scriptId);
      if (!script) return;
      event.preventDefault();
      event.stopPropagation();
      void runProjectScript(script);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [
    activeProject,
    terminalState.terminalOpen,
    terminalState.activeTerminalId,
    activeThreadId,
    closeActiveWorkspaceTerminal,
    createScopedAiPaneThread,
    createNewTerminalPane,
    setTerminalOpen,
    runProjectScript,
    splitTerminal,
    keybindings,
    onToggleDiff,
  ]);

  const onRevertToTurnCount = useCallback(
    async (turnCount: number) => {
      const api = readEnvironmentApi(environmentId);
      const localApi = readLocalApi();
      if (!api || !localApi || !activeThread || isRevertingCheckpoint) return;

      if (activeEnvironmentUnavailable && activeEnvironmentUnavailableLabel) {
        setThreadError(
          activeThread.id,
          `Reconnect ${activeEnvironmentUnavailableLabel} before reverting checkpoints.`,
        );
        return;
      }
      if (phase === "running" || isSendBusy || isConnecting) {
        setThreadError(activeThread.id, "Interrupt the current turn before reverting checkpoints.");
        return;
      }
      const confirmed = await localApi.dialogs.confirm(
        [
          `Revert this thread to checkpoint ${turnCount}?`,
          "This will discard newer messages and turn diffs in this thread.",
          "This action cannot be undone.",
        ].join("\n"),
      );
      if (!confirmed) {
        return;
      }

      setIsRevertingCheckpoint(true);
      setThreadError(activeThread.id, null);
      try {
        await api.orchestration.dispatchCommand({
          type: "thread.checkpoint.revert",
          commandId: newCommandId(),
          threadId: activeThread.id,
          turnCount,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        setThreadError(
          activeThread.id,
          err instanceof Error ? err.message : "Failed to revert thread state.",
        );
      }
      setIsRevertingCheckpoint(false);
    },
    [
      activeThread,
      activeEnvironmentUnavailable,
      activeEnvironmentUnavailableLabel,
      environmentId,
      isConnecting,
      isRevertingCheckpoint,
      isSendBusy,
      phase,
      setThreadError,
    ],
  );

  const onSend = async (e?: { preventDefault: () => void }) => {
    e?.preventDefault();
    const api = readEnvironmentApi(environmentId);
    if (
      !api ||
      !activeThread ||
      isSendBusy ||
      isConnecting ||
      activeEnvironmentUnavailable ||
      sendInFlightRef.current
    )
      return;
    if (activePendingProgress) {
      onAdvanceActivePendingUserInput();
      return;
    }
    const sendCtx = composerRef.current?.getSendContext();
    if (!sendCtx) return;
    const {
      images: composerImages,
      terminalContexts: composerTerminalContexts,
      selectedProvider: ctxSelectedProvider,
      selectedModel: ctxSelectedModel,
      selectedProviderModels: ctxSelectedProviderModels,
      selectedPromptEffort: ctxSelectedPromptEffort,
      selectedModelSelection: ctxSelectedModelSelection,
    } = sendCtx;
    const promptForSend = promptRef.current;
    const {
      trimmedPrompt: trimmed,
      sendableTerminalContexts: sendableComposerTerminalContexts,
      expiredTerminalContextCount,
      hasSendableContent,
    } = deriveComposerSendState({
      prompt: promptForSend,
      imageCount: composerImages.length,
      terminalContexts: composerTerminalContexts,
    });
    if (showPlanFollowUpPrompt && activeProposedPlan) {
      const followUp = resolvePlanFollowUpSubmission({
        draftText: trimmed,
        planMarkdown: activeProposedPlan.planMarkdown,
      });
      promptRef.current = "";
      clearComposerDraftContent(composerDraftTarget);
      composerRef.current?.resetCursorState();
      await onSubmitPlanFollowUp({
        text: followUp.text,
        interactionMode: followUp.interactionMode,
      });
      return;
    }
    const standaloneSlashCommand =
      composerImages.length === 0 && sendableComposerTerminalContexts.length === 0
        ? parseStandaloneComposerSlashCommand(trimmed)
        : null;
    if (standaloneSlashCommand) {
      handleInteractionModeChange(standaloneSlashCommand);
      promptRef.current = "";
      clearComposerDraftContent(composerDraftTarget);
      composerRef.current?.resetCursorState();
      return;
    }
    if (!hasSendableContent) {
      if (expiredTerminalContextCount > 0) {
        const toastCopy = buildExpiredTerminalContextToastCopy(
          expiredTerminalContextCount,
          "empty",
        );
        toastManager.add(
          stackedThreadToast({
            type: "warning",
            title: toastCopy.title,
            description: toastCopy.description,
          }),
        );
      }
      return;
    }
    if (!activeProject) return;
    const threadIdForSend = activeThread.id;
    const isFirstMessage = !isServerThread || activeThread.messages.length === 0;
    const baseBranchForWorktree =
      isFirstMessage && sendEnvMode === "worktree" && !activeThread.worktreePath
        ? activeThreadBranch
        : null;

    // In worktree mode, require an explicit base branch so we don't silently
    // fall back to local execution when branch selection is missing.
    const shouldCreateWorktree =
      isFirstMessage && sendEnvMode === "worktree" && !activeThread.worktreePath;
    if (shouldCreateWorktree && !activeThreadBranch) {
      setThreadError(threadIdForSend, "Select a base branch before sending in New worktree mode.");
      return;
    }

    sendInFlightRef.current = true;
    beginLocalDispatch({ preparingWorktree: Boolean(baseBranchForWorktree) });

    const composerImagesSnapshot = [...composerImages];
    const composerTerminalContextsSnapshot = [...sendableComposerTerminalContexts];
    const messageTextForSend = appendTerminalContextsToPrompt(
      promptForSend,
      composerTerminalContextsSnapshot,
    );
    const messageIdForSend = newMessageId();
    const messageCreatedAt = new Date().toISOString();
    const outgoingMessageText = formatOutgoingPrompt({
      provider: ctxSelectedProvider,
      model: ctxSelectedModel,
      models: ctxSelectedProviderModels,
      effort: ctxSelectedPromptEffort,
      text: messageTextForSend || IMAGE_ONLY_BOOTSTRAP_PROMPT,
    });
    const turnAttachmentsPromise = Promise.all(
      composerImagesSnapshot.map(async (image) => ({
        type: "image" as const,
        name: image.name,
        mimeType: image.mimeType,
        sizeBytes: image.sizeBytes,
        dataUrl: await readFileAsDataUrl(image.file),
      })),
    );
    const optimisticAttachments = composerImagesSnapshot.map((image) => ({
      type: "image" as const,
      id: image.id,
      name: image.name,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      previewUrl: image.previewUrl,
    }));
    // Scroll to the current end *before* adding the optimistic message.
    // This sets LegendList's internal isAtEnd=true so maintainScrollAtEnd
    // automatically pins to the new item when the data changes.
    isAtEndRef.current = true;
    showScrollDebouncer.current.cancel();
    setShowScrollToBottom(false);
    await legendListRef.current?.scrollToEnd?.({ animated: false });

    setOptimisticUserMessages((existing) => [
      ...existing,
      {
        id: messageIdForSend,
        role: "user",
        text: outgoingMessageText,
        ...(optimisticAttachments.length > 0 ? { attachments: optimisticAttachments } : {}),
        createdAt: messageCreatedAt,
        streaming: false,
      },
    ]);

    setThreadError(threadIdForSend, null);
    if (expiredTerminalContextCount > 0) {
      const toastCopy = buildExpiredTerminalContextToastCopy(
        expiredTerminalContextCount,
        "omitted",
      );
      toastManager.add(
        stackedThreadToast({
          type: "warning",
          title: toastCopy.title,
          description: toastCopy.description,
        }),
      );
    }
    promptRef.current = "";
    clearComposerDraftContent(composerDraftTarget);
    composerRef.current?.resetCursorState();

    let turnStartSucceeded = false;
    await (async () => {
      let firstComposerImageName: string | null = null;
      if (composerImagesSnapshot.length > 0) {
        const firstComposerImage = composerImagesSnapshot[0];
        if (firstComposerImage) {
          firstComposerImageName = firstComposerImage.name;
        }
      }
      let titleSeed = trimmed;
      if (!titleSeed) {
        if (firstComposerImageName) {
          titleSeed = `Image: ${firstComposerImageName}`;
        } else if (composerTerminalContextsSnapshot.length > 0) {
          titleSeed = formatTerminalContextLabel(composerTerminalContextsSnapshot[0]!);
        } else {
          titleSeed = "New thread";
        }
      }
      const title = truncate(titleSeed);
      const threadCreateModelSelection = createModelSelection(
        ctxSelectedModelSelection.instanceId,
        ctxSelectedModel || activeProject.defaultModelSelection?.model || DEFAULT_MODEL,
        ctxSelectedModelSelection.options,
      );

      // Auto-title from first message
      if (isFirstMessage && isServerThread) {
        await api.orchestration.dispatchCommand({
          type: "thread.meta.update",
          commandId: newCommandId(),
          threadId: threadIdForSend,
          title,
        });
      }

      if (isServerThread) {
        await persistThreadSettingsForNextTurn({
          threadId: threadIdForSend,
          createdAt: messageCreatedAt,
          ...(ctxSelectedModel ? { modelSelection: ctxSelectedModelSelection } : {}),
          runtimeMode,
          interactionMode,
        });
      }

      const turnAttachments = await turnAttachmentsPromise;
      const bootstrap =
        isLocalDraftThread || baseBranchForWorktree
          ? {
              ...(isLocalDraftThread
                ? {
                    createThread: {
                      projectId: activeProject.id,
                      title,
                      modelSelection: threadCreateModelSelection,
                      runtimeMode,
                      interactionMode,
                      branch: activeThreadBranch,
                      worktreePath: activeThread.worktreePath,
                      createdAt: activeThread.createdAt,
                    },
                  }
                : {}),
              ...(baseBranchForWorktree
                ? {
                    prepareWorktree: {
                      projectCwd: activeProject.cwd,
                      baseBranch: baseBranchForWorktree,
                      branch: buildTemporaryWorktreeBranchName(randomHex),
                    },
                    runSetupScript: true,
                  }
                : {}),
            }
          : undefined;
      beginLocalDispatch({ preparingWorktree: false });
      await api.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId: threadIdForSend,
        message: {
          messageId: messageIdForSend,
          role: "user",
          text: outgoingMessageText,
          attachments: turnAttachments,
        },
        modelSelection: ctxSelectedModelSelection,
        titleSeed: title,
        runtimeMode,
        interactionMode,
        ...(bootstrap ? { bootstrap } : {}),
        createdAt: messageCreatedAt,
      });
      turnStartSucceeded = true;
    })().catch(async (err: unknown) => {
      if (
        !turnStartSucceeded &&
        promptRef.current.length === 0 &&
        composerImagesRef.current.length === 0 &&
        composerTerminalContextsRef.current.length === 0
      ) {
        setOptimisticUserMessages((existing) => {
          const removed = existing.filter((message) => message.id === messageIdForSend);
          for (const message of removed) {
            revokeUserMessagePreviewUrls(message);
          }
          const next = existing.filter((message) => message.id !== messageIdForSend);
          return next.length === existing.length ? existing : next;
        });
        promptRef.current = promptForSend;
        const retryComposerImages = composerImagesSnapshot.map(cloneComposerImageForRetry);
        composerImagesRef.current = retryComposerImages;
        composerTerminalContextsRef.current = composerTerminalContextsSnapshot;
        setComposerDraftPrompt(composerDraftTarget, promptForSend);
        addComposerDraftImages(composerDraftTarget, retryComposerImages);
        setComposerDraftTerminalContexts(composerDraftTarget, composerTerminalContextsSnapshot);
        composerRef.current?.resetCursorState({
          cursor: collapseExpandedComposerCursor(promptForSend, promptForSend.length),
          prompt: promptForSend,
          detectTrigger: true,
        });
      }
      setThreadError(
        threadIdForSend,
        err instanceof Error ? err.message : "Failed to send message.",
      );
    });
    sendInFlightRef.current = false;
    if (!turnStartSucceeded) {
      resetLocalDispatch();
    }
  };

  const onInterrupt = async () => {
    const api = readEnvironmentApi(environmentId);
    if (!api || !activeThread) return;
    await api.orchestration.dispatchCommand({
      type: "thread.turn.interrupt",
      commandId: newCommandId(),
      threadId: activeThread.id,
      createdAt: new Date().toISOString(),
    });
  };

  const onRespondToApproval = useCallback(
    async (requestId: ApprovalRequestId, decision: ProviderApprovalDecision) => {
      const api = readEnvironmentApi(environmentId);
      if (!api || !activeThreadId) return;

      setRespondingRequestIds((existing) =>
        existing.includes(requestId) ? existing : [...existing, requestId],
      );
      await api.orchestration
        .dispatchCommand({
          type: "thread.approval.respond",
          commandId: newCommandId(),
          threadId: activeThreadId,
          requestId,
          decision,
          createdAt: new Date().toISOString(),
        })
        .catch((err: unknown) => {
          setThreadError(
            activeThreadId,
            err instanceof Error ? err.message : "Failed to submit approval decision.",
          );
        });
      setRespondingRequestIds((existing) => existing.filter((id) => id !== requestId));
    },
    [activeThreadId, environmentId, setThreadError],
  );

  const onRespondToUserInput = useCallback(
    async (requestId: ApprovalRequestId, answers: Record<string, unknown>) => {
      const api = readEnvironmentApi(environmentId);
      if (!api || !activeThreadId) return;

      setRespondingUserInputRequestIds((existing) =>
        existing.includes(requestId) ? existing : [...existing, requestId],
      );
      await api.orchestration
        .dispatchCommand({
          type: "thread.user-input.respond",
          commandId: newCommandId(),
          threadId: activeThreadId,
          requestId,
          answers,
          createdAt: new Date().toISOString(),
        })
        .catch((err: unknown) => {
          setThreadError(
            activeThreadId,
            err instanceof Error ? err.message : "Failed to submit user input.",
          );
        });
      setRespondingUserInputRequestIds((existing) => existing.filter((id) => id !== requestId));
    },
    [activeThreadId, environmentId, setThreadError],
  );

  const setActivePendingUserInputQuestionIndex = useCallback(
    (nextQuestionIndex: number) => {
      if (!activePendingUserInput) {
        return;
      }
      setPendingUserInputQuestionIndexByRequestId((existing) => ({
        ...existing,
        [activePendingUserInput.requestId]: nextQuestionIndex,
      }));
    },
    [activePendingUserInput],
  );

  const onSelectActivePendingUserInputOption = useCallback(
    (questionId: string, optionLabel: string) => {
      if (!activePendingUserInput) {
        return;
      }
      setPendingUserInputAnswersByRequestId((existing) => {
        const question =
          (activePendingProgress?.activeQuestion?.id === questionId
            ? activePendingProgress.activeQuestion
            : undefined) ??
          activePendingUserInput.questions.find((entry) => entry.id === questionId);
        if (!question) {
          return existing;
        }

        return {
          ...existing,
          [activePendingUserInput.requestId]: {
            ...existing[activePendingUserInput.requestId],
            [questionId]: togglePendingUserInputOptionSelection(
              question,
              existing[activePendingUserInput.requestId]?.[questionId],
              optionLabel,
            ),
          },
        };
      });
      promptRef.current = "";
      composerRef.current?.resetCursorState({ cursor: 0 });
    },
    [activePendingProgress?.activeQuestion, activePendingUserInput],
  );

  const onChangeActivePendingUserInputCustomAnswer = useCallback(
    (
      questionId: string,
      value: string,
      nextCursor: number,
      expandedCursor: number,
      _cursorAdjacentToMention: boolean,
    ) => {
      if (!activePendingUserInput) {
        return;
      }
      promptRef.current = value;
      setPendingUserInputAnswersByRequestId((existing) => ({
        ...existing,
        [activePendingUserInput.requestId]: {
          ...existing[activePendingUserInput.requestId],
          [questionId]: setPendingUserInputCustomAnswer(
            existing[activePendingUserInput.requestId]?.[questionId],
            value,
          ),
        },
      }));
      const snapshot = composerRef.current?.readSnapshot();
      if (
        snapshot?.value !== value ||
        snapshot.cursor !== nextCursor ||
        snapshot.expandedCursor !== expandedCursor
      ) {
        composerRef.current?.focusAt(nextCursor);
      }
    },
    [activePendingUserInput],
  );

  const onAdvanceActivePendingUserInput = useCallback(() => {
    if (!activePendingUserInput || !activePendingProgress) {
      return;
    }
    if (activePendingProgress.isLastQuestion) {
      if (activePendingResolvedAnswers) {
        void onRespondToUserInput(activePendingUserInput.requestId, activePendingResolvedAnswers);
      }
      return;
    }
    setActivePendingUserInputQuestionIndex(activePendingProgress.questionIndex + 1);
  }, [
    activePendingProgress,
    activePendingResolvedAnswers,
    activePendingUserInput,
    onRespondToUserInput,
    setActivePendingUserInputQuestionIndex,
  ]);

  const onPreviousActivePendingUserInputQuestion = useCallback(() => {
    if (!activePendingProgress) {
      return;
    }
    setActivePendingUserInputQuestionIndex(Math.max(activePendingProgress.questionIndex - 1, 0));
  }, [activePendingProgress, setActivePendingUserInputQuestionIndex]);

  const onSubmitPlanFollowUp = useCallback(
    async ({
      text,
      interactionMode: nextInteractionMode,
    }: {
      text: string;
      interactionMode: "default" | "plan";
    }) => {
      const api = readEnvironmentApi(environmentId);
      if (
        !api ||
        !activeThread ||
        !isServerThread ||
        isSendBusy ||
        isConnecting ||
        sendInFlightRef.current
      ) {
        return;
      }

      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      const sendCtx = composerRef.current?.getSendContext();
      if (!sendCtx) {
        return;
      }
      const {
        selectedProvider: ctxSelectedProvider,
        selectedModel: ctxSelectedModel,
        selectedProviderModels: ctxSelectedProviderModels,
        selectedPromptEffort: ctxSelectedPromptEffort,
        selectedModelSelection: ctxSelectedModelSelection,
      } = sendCtx;

      const threadIdForSend = activeThread.id;
      const messageIdForSend = newMessageId();
      const messageCreatedAt = new Date().toISOString();
      const outgoingMessageText = formatOutgoingPrompt({
        provider: ctxSelectedProvider,
        model: ctxSelectedModel,
        models: ctxSelectedProviderModels,
        effort: ctxSelectedPromptEffort,
        text: trimmed,
      });

      sendInFlightRef.current = true;
      beginLocalDispatch({ preparingWorktree: false });
      setThreadError(threadIdForSend, null);

      // Scroll to the current end *before* adding the optimistic message.
      isAtEndRef.current = true;
      showScrollDebouncer.current.cancel();
      setShowScrollToBottom(false);
      await legendListRef.current?.scrollToEnd?.({ animated: false });

      setOptimisticUserMessages((existing) => [
        ...existing,
        {
          id: messageIdForSend,
          role: "user",
          text: outgoingMessageText,
          createdAt: messageCreatedAt,
          streaming: false,
        },
      ]);

      try {
        await persistThreadSettingsForNextTurn({
          threadId: threadIdForSend,
          createdAt: messageCreatedAt,
          modelSelection: ctxSelectedModelSelection,
          runtimeMode,
          interactionMode: nextInteractionMode,
        });

        // Keep the mode toggle and plan-follow-up banner in sync immediately
        // while the same-thread implementation turn is starting.
        setComposerDraftInteractionMode(
          scopeThreadRef(activeThread.environmentId, threadIdForSend),
          nextInteractionMode,
        );

        await api.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: threadIdForSend,
          message: {
            messageId: messageIdForSend,
            role: "user",
            text: outgoingMessageText,
            attachments: [],
          },
          modelSelection: ctxSelectedModelSelection,
          titleSeed: activeThread.title,
          runtimeMode,
          interactionMode: nextInteractionMode,
          ...(nextInteractionMode === "default" && activeProposedPlan
            ? {
                sourceProposedPlan: {
                  threadId: activeThread.id,
                  planId: activeProposedPlan.id,
                },
              }
            : {}),
          createdAt: messageCreatedAt,
        });
        // Optimistically open the plan sidebar when implementing (not refining).
        // "default" mode here means the agent is executing the plan, which produces
        // step-tracking activities that the sidebar will display.
        if (nextInteractionMode === "default" && autoOpenPlanSidebar) {
          planSidebarDismissedForTurnRef.current = null;
          setPlanSidebarOpen(true);
        }
        sendInFlightRef.current = false;
      } catch (err) {
        setOptimisticUserMessages((existing) =>
          existing.filter((message) => message.id !== messageIdForSend),
        );
        setThreadError(
          threadIdForSend,
          err instanceof Error ? err.message : "Failed to send plan follow-up.",
        );
        sendInFlightRef.current = false;
        resetLocalDispatch();
      }
    },
    [
      activeThread,
      activeProposedPlan,
      beginLocalDispatch,
      isConnecting,
      isSendBusy,
      isServerThread,
      persistThreadSettingsForNextTurn,
      resetLocalDispatch,
      runtimeMode,
      setComposerDraftInteractionMode,
      setPlanSidebarOpen,
      setThreadError,
      autoOpenPlanSidebar,
      environmentId,
    ],
  );

  const onImplementPlanInNewThread = useCallback(async () => {
    const api = readEnvironmentApi(environmentId);
    if (
      !api ||
      !activeThread ||
      !activeProject ||
      !activeProposedPlan ||
      !isServerThread ||
      isSendBusy ||
      isConnecting ||
      activeEnvironmentUnavailable ||
      sendInFlightRef.current
    ) {
      return;
    }

    const sendCtx = composerRef.current?.getSendContext();
    if (!sendCtx) {
      return;
    }
    const {
      selectedProvider: ctxSelectedProvider,
      selectedModel: ctxSelectedModel,
      selectedProviderModels: ctxSelectedProviderModels,
      selectedPromptEffort: ctxSelectedPromptEffort,
      selectedModelSelection: ctxSelectedModelSelection,
    } = sendCtx;

    const createdAt = new Date().toISOString();
    const nextThreadId = newThreadId();
    const planMarkdown = activeProposedPlan.planMarkdown;
    const implementationPrompt = buildPlanImplementationPrompt(planMarkdown);
    const outgoingImplementationPrompt = formatOutgoingPrompt({
      provider: ctxSelectedProvider,
      model: ctxSelectedModel,
      models: ctxSelectedProviderModels,
      effort: ctxSelectedPromptEffort,
      text: implementationPrompt,
    });
    const nextThreadTitle = truncate(buildPlanImplementationThreadTitle(planMarkdown));
    const nextThreadModelSelection: ModelSelection = ctxSelectedModelSelection;

    sendInFlightRef.current = true;
    beginLocalDispatch({ preparingWorktree: false });
    const finish = () => {
      sendInFlightRef.current = false;
      resetLocalDispatch();
    };

    await api.orchestration
      .dispatchCommand({
        type: "thread.create",
        commandId: newCommandId(),
        threadId: nextThreadId,
        projectId: activeProject.id,
        title: nextThreadTitle,
        modelSelection: nextThreadModelSelection,
        runtimeMode,
        interactionMode: "default",
        branch: activeThreadBranch,
        worktreePath: activeThread.worktreePath,
        createdAt,
      })
      .then(() => {
        return api.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: nextThreadId,
          message: {
            messageId: newMessageId(),
            role: "user",
            text: outgoingImplementationPrompt,
            attachments: [],
          },
          modelSelection: ctxSelectedModelSelection,
          titleSeed: nextThreadTitle,
          runtimeMode,
          interactionMode: "default",
          sourceProposedPlan: {
            threadId: activeThread.id,
            planId: activeProposedPlan.id,
          },
          createdAt,
        });
      })
      .then(() => {
        return waitForStartedServerThread(scopeThreadRef(activeThread.environmentId, nextThreadId));
      })
      .then(() => {
        // Signal that the plan sidebar should open on the new thread when enabled.
        planSidebarOpenOnNextThreadRef.current = autoOpenPlanSidebar;
        return navigate({
          to: "/$environmentId/$threadId",
          params: {
            environmentId: activeThread.environmentId,
            threadId: nextThreadId,
          },
        });
      })
      .catch(async (err: unknown) => {
        await api.orchestration
          .dispatchCommand({
            type: "thread.delete",
            commandId: newCommandId(),
            threadId: nextThreadId,
          })
          .catch(() => undefined);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not start implementation thread",
            description:
              err instanceof Error
                ? err.message
                : "An error occurred while creating the new thread.",
          }),
        );
      })
      .then(finish, finish);
  }, [
    activeProject,
    activeProposedPlan,
    activeThreadBranch,
    activeThread,
    beginLocalDispatch,
    activeEnvironmentUnavailable,
    isConnecting,
    isSendBusy,
    isServerThread,
    navigate,
    resetLocalDispatch,
    runtimeMode,
    autoOpenPlanSidebar,
    environmentId,
  ]);

  const onProviderModelSelect = useCallback(
    (instanceId: ProviderInstanceId, model: string) => {
      if (!activeThread) return;
      // Look up the configured instance so model normalization and custom
      // model lookup stay scoped to that exact instance. Unknown instance ids
      // are rejected by returning early; the server remains authoritative too.
      const entry = providerStatusesForChat.find((snapshot) => snapshot.instanceId === instanceId);
      const resolvedDriverKind = entry?.driver ?? null;
      if (
        lockedProvider !== null &&
        resolvedDriverKind !== null &&
        resolvedDriverKind !== lockedProvider
      ) {
        scheduleComposerFocus();
        return;
      }
      if (lockedProvider !== null && activeThread.session?.providerInstanceId) {
        const currentEntry = providerStatusesForChat.find(
          (snapshot) => snapshot.instanceId === activeThread.session?.providerInstanceId,
        );
        if (
          currentEntry?.continuation?.groupKey &&
          entry?.continuation?.groupKey &&
          currentEntry.continuation.groupKey !== entry.continuation.groupKey
        ) {
          scheduleComposerFocus();
          return;
        }
      }
      const resolvedModel = resolveAppModelSelectionForInstance(
        instanceId,
        settings,
        providerStatusesForChat,
        model,
        getAppModelOptionConfigForProvider(entry),
      );
      if (!resolvedModel) {
        scheduleComposerFocus();
        return;
      }
      const nextModelSelection: ModelSelection = {
        instanceId,
        model: resolvedModel,
      };
      setComposerDraftModelSelection(
        scopeThreadRef(activeThread.environmentId, activeThread.id),
        nextModelSelection,
      );
      setStickyComposerModelSelection(nextModelSelection);
      scheduleComposerFocus();
    },
    [
      activeThread,
      lockedProvider,
      scheduleComposerFocus,
      setComposerDraftModelSelection,
      setStickyComposerModelSelection,
      providerStatusesForChat,
      settings,
    ],
  );
  const onEnvModeChange = useCallback(
    (mode: DraftThreadEnvMode) => {
      if (canOverrideServerThreadEnvMode) {
        setPendingServerThreadEnvMode(mode);
        scheduleComposerFocus();
        return;
      }
      if (isLocalDraftThread) {
        setDraftThreadContext(composerDraftTarget, {
          envMode: mode,
          ...(mode === "worktree" && draftThread?.worktreePath ? { worktreePath: null } : {}),
        });
      }
      scheduleComposerFocus();
    },
    [
      canOverrideServerThreadEnvMode,
      composerDraftTarget,
      draftThread?.worktreePath,
      isLocalDraftThread,
      setPendingServerThreadEnvMode,
      scheduleComposerFocus,
      setDraftThreadContext,
    ],
  );

  const onExpandTimelineImage = useCallback((preview: ExpandedImagePreview) => {
    setExpandedImage(preview);
  }, []);
  const onOpenTurnDiff = useCallback(
    (turnId: TurnId, filePath?: string) => {
      if (!isServerThread) {
        return;
      }
      onDiffPanelOpen?.();
      void navigate({
        to: "/$environmentId/$threadId",
        params: {
          environmentId,
          threadId,
        },
        search: (previous) => {
          const rest = stripDiffSearchParams(previous);
          return filePath
            ? { ...rest, diff: "1", diffTurnId: turnId, diffFilePath: filePath }
            : { ...rest, diff: "1", diffTurnId: turnId };
        },
      });
    },
    [environmentId, isServerThread, navigate, onDiffPanelOpen, threadId],
  );
  // Both the Map and the revert handler are read from refs at call-time so
  // the callback reference is fully stable and never busts context identity.
  const revertTurnCountRef = useRef(revertTurnCountByUserMessageId);
  revertTurnCountRef.current = revertTurnCountByUserMessageId;
  const onRevertToTurnCountRef = useRef(onRevertToTurnCount);
  onRevertToTurnCountRef.current = onRevertToTurnCount;
  const onRevertUserMessage = useCallback((messageId: MessageId) => {
    const targetTurnCount = revertTurnCountRef.current.get(messageId);
    if (typeof targetTurnCount !== "number") {
      return;
    }
    void onRevertToTurnCountRef.current(targetTurnCount);
  }, []);
  const renameAiThread = useCallback(
    async (nextTitle: string | null) => {
      if (!activeThread) {
        return;
      }

      if (routeKind !== "server") {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to rename thread",
            description: "Thread rename is only available after the thread is created.",
          }),
        );
        return;
      }

      const result = await renameThreadTitle({
        threadRef: scopeThreadRef(activeThread.environmentId, activeThread.id),
        newTitle: nextTitle,
        originalTitle: activeThread.title,
      });
      switch (result.type) {
        case "empty":
          toastManager.add({
            type: "warning",
            title: "Thread title cannot be empty",
          });
          return;
        case "api-unavailable":
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Failed to rename thread",
              description: "Thread API unavailable.",
            }),
          );
          return;
        case "failed":
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Failed to rename thread",
              description:
                result.error instanceof Error ? result.error.message : "An error occurred.",
            }),
          );
          return;
        case "renamed":
        case "unchanged":
          return;
      }
    },
    [activeThread, routeKind],
  );
  // Empty state: no active thread
  if (!activeThread) {
    if (workspaceMode === "ai-pane") {
      return (
        <WorkspacePane
          title="AI"
          actions={embeddedPaneActions}
          isActive={embeddedPaneActive}
          className="min-h-[32rem] xl:min-h-0"
        >
          <div className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground text-sm">
            No thread is open in this AI pane.
          </div>
        </WorkspacePane>
      );
    }
    return <NoActiveThreadState />;
  }

  const editorPaneTitle =
    paneTitleOverrideById.editor ??
    resolveEditorPaneDefaultTitle(workspaceName, activeWorkspaceRoot);
  const aiPaneTitleControl =
    isServerThread && activeThreadKey && activeWorkspaceThreadOptions.length > 0 ? (
      <Select value={activeThreadKey} onValueChange={handleAiPaneThreadChange}>
        <SelectTrigger
          aria-label="AI pane thread"
          className="-ml-2 h-8 min-w-0 max-w-[min(28rem,58vw)] rounded-md px-2 font-semibold text-foreground text-sm sm:text-[0.95rem]"
          size="sm"
          variant="ghost"
        >
          <span className="min-w-0 flex-1 truncate">{activeThread.title}</span>
        </SelectTrigger>
        <SelectPopup align="start" alignItemWithTrigger={false} className="max-h-80">
          {activeWorkspaceThreadOptions.map((thread) => {
            const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
            const status = resolveThreadStatusPill({ thread });
            return (
              <SelectItem key={threadKey} value={threadKey}>
                <span className="flex min-w-0 items-center gap-2">
                  {status ? <ThreadStatusLabel status={status} compact /> : null}
                  <span className="min-w-0 truncate">{thread.title}</span>
                </span>
              </SelectItem>
            );
          })}
        </SelectPopup>
      </Select>
    ) : null;
  const aiPaneNewThreadButton = canCancelCleanDraftThread ? null : (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Create new thread in this AI pane"
            data-testid="ai-pane-new-thread-button"
            onClick={() => void createScopedAiPaneThread("default")}
          >
            <SquarePenIcon className="size-3.5" />
          </button>
        }
      />
      <TooltipPopup side="bottom">
        {aiPaneNewThreadShortcutLabel
          ? `New thread (${aiPaneNewThreadShortcutLabel})`
          : "New thread"}
      </TooltipPopup>
    </Tooltip>
  );
  const aiPaneCancelDraftButton = canCancelCleanDraftThread ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Cancel new thread"
            data-testid="cancel-clean-draft-thread-button"
            onClick={() => void cancelCleanDraftThread()}
          >
            <XIcon className="size-3.5" />
          </button>
        }
      />
      <TooltipPopup side="bottom">Cancel new thread</TooltipPopup>
    </Tooltip>
  ) : null;
  const aiPaneDeleteThreadButton = isServerThread ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete thread"
            data-testid="ai-pane-delete-thread-button"
            onClick={() => void deleteActiveAiPaneThread()}
          >
            <Trash2Icon className="size-3.5" />
          </button>
        }
      />
      <TooltipPopup side="bottom">Delete thread</TooltipPopup>
    </Tooltip>
  ) : null;
  const aiPaneHeaderActions = (
    <>
      {aiPaneCancelDraftButton}
      {aiPaneNewThreadButton}
      {aiPaneDeleteThreadButton}
    </>
  );
  const workspaceEditorActionProps = {
    activeThreadEnvironmentId: activeThread.environmentId,
    activeThreadId: activeThread.id,
    ...(routeKind === "draft" && draftId ? { draftId } : {}),
    activeProjectName: activeProject?.name,
    openInCwd: gitCwd,
    activeProjectScripts: activeProject?.scripts,
    preferredScriptId: activeProject
      ? (lastInvokedScriptByProjectId[activeProject.id] ?? null)
      : null,
    keybindings,
    availableEditors,
    gitCwd,
    onRunProjectScript: runProjectScript,
    onAddProjectScript: saveProjectScript,
    onUpdateProjectScript: updateProjectScript,
    onDeleteProjectScript: deleteProjectScript,
  };
  const hiddenMountedTerminalThreadRefs = mountedTerminalThreadRefs.filter(
    ({ key }) => key !== activeThreadKey,
  );
  const fallbackTerminalPaneTitle = activeTerminalGroup
    ? (basenameOfPanePath(activeWorkspaceRoot) ?? "Terminal")
    : "Terminal";
  const fallbackWorkspaceDockedPanes: PersistedWorkspaceDockedPane[] = [
    {
      paneId: "editor",
      type: "editor",
      title: editorPaneTitle,
      environmentId: activeThread.environmentId,
      cwd: activeWorkspaceRoot ?? null,
      order: 0,
      size: 1,
      metadata: {
        activePath: null,
      },
    },
    {
      paneId: "ai",
      type: "ai",
      title: activeThread.title,
      environmentId: activeThread.environmentId,
      cwd: activeWorkspaceRoot ?? null,
      order: 1,
      size: 1,
      metadata: {
        threadId: activeThread.id,
      },
    },
    {
      paneId: "terminal",
      type: "terminal",
      title: fallbackTerminalPaneTitle,
      environmentId: activeThread.environmentId,
      cwd: activeWorkspaceRoot ?? null,
      order: 2,
      size: 1,
      metadata: {
        threadId: activeThread.id,
        terminalId: DEFAULT_THREAD_TERMINAL_ID,
        terminalGroupId: `group-${DEFAULT_THREAD_TERMINAL_ID}`,
      },
    },
  ];
  const rawRenderedWorkspaceDockedPanes =
    workspaceDockedPanes.length > 0 ? workspaceDockedPanes : fallbackWorkspaceDockedPanes;
  const renderedWorkspaceDockedPanes = sanitizeUnavailableWorkspacePaneThreads({
    panes: rawRenderedWorkspaceDockedPanes,
    isThreadAvailable: (pane) => {
      const threadId = pane.metadata.threadId;
      if (threadId === null) {
        return true;
      }
      const paneThreadKey = scopedThreadKey(
        scopeThreadRef(pane.environmentId as EnvironmentId, threadId as ThreadId),
      );
      return serverThreadKeySet.has(paneThreadKey) || draftIdByThreadKey.has(paneThreadKey);
    },
  });
  useEffect(() => {
    if (
      workspaceDockedPanes.length === 0 ||
      renderedWorkspaceDockedPanes === rawRenderedWorkspaceDockedPanes
    ) {
      return;
    }
    storeSetWorkspaceThreadDockedPanes(workspaceLayoutKey, renderedWorkspaceDockedPanes);
  }, [
    rawRenderedWorkspaceDockedPanes,
    renderedWorkspaceDockedPanes,
    storeSetWorkspaceThreadDockedPanes,
    workspaceDockedPanes.length,
    workspaceLayoutKey,
  ]);
  const workspaceRunningTerminalThreadRefs = useMemo(() => {
    const threadRefByKey = new Map<string, WorkspaceRunningTerminalThreadRef>();
    for (const pane of renderedWorkspaceDockedPanes) {
      if (pane.type !== "terminal") {
        continue;
      }
      const threadRef = scopeThreadRef(
        pane.environmentId as EnvironmentId,
        ThreadId.make(pane.metadata.threadId ?? activeThread.id),
      );
      const threadKey = scopedThreadKey(threadRef);
      threadRefByKey.set(threadKey, {
        key: threadKey,
        environmentId: threadRef.environmentId,
        threadId: threadRef.threadId,
      });
    }
    return Array.from(threadRefByKey.values());
  }, [activeThread.id, renderedWorkspaceDockedPanes]);
  const handleWorkspacePanesChange = useCallback(
    (panes: readonly PersistedWorkspaceDockedPane[]) => {
      storeSetWorkspaceThreadDockedPanes(
        workspaceLayoutKey,
        mergeVisibleWorkspacePaneUpdates(renderedWorkspaceDockedPanes, panes),
      );
    },
    [renderedWorkspaceDockedPanes, storeSetWorkspaceThreadDockedPanes, workspaceLayoutKey],
  );
  const setWorkspacePaneWidth = useCallback(
    (paneId: string, widthPreset: WorkspaceDockedPaneWidthPreset) => {
      storeSetWorkspaceThreadDockedPanes(
        workspaceLayoutKey,
        setWorkspacePaneWidthPreset(renderedWorkspaceDockedPanes, paneId, widthPreset),
        paneId,
      );
    },
    [renderedWorkspaceDockedPanes, storeSetWorkspaceThreadDockedPanes, workspaceLayoutKey],
  );
  const terminalPaneDeckHeight = workspaceTerminalRowHeight(terminalState.terminalHeight);
  const terminalRuntimeEnv = useMemo(
    () =>
      activeProjectCwd
        ? projectScriptRuntimeEnv({
            project: { cwd: activeProjectCwd },
            worktreePath: activeThreadWorktreePath,
          })
        : EMPTY_TERMINAL_RUNTIME_ENV,
    [activeProjectCwd, activeThreadWorktreePath],
  );
  const renderWorkspacePane = (pane: PersistedWorkspaceDockedPane) => {
    const paneTitle = paneTitleOverrideById[pane.paneId] ?? pane.title;
    const isPaneActive = activeWorkspaceDockedPaneId === pane.paneId;
    const renderPaneWidthPresetControl = () => {
      const currentPreset = workspacePaneWidthPreset(pane);
      const presetLabel = workspacePaneWidthPresetLabel(currentPreset);
      const CurrentPresetIcon = workspacePaneWidthPresetIcon(currentPreset);
      return (
        <Popover>
          <PopoverTrigger
            openOnHover
            delay={120}
            closeDelay={180}
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-popup-open:bg-accent data-popup-open:text-foreground"
            aria-label={`${paneTitle} width preset: ${presetLabel}`}
          >
            <CurrentPresetIcon className="size-3.5" />
          </PopoverTrigger>
          <PopoverPopup
            tooltipStyle
            side="bottom"
            align="start"
            sideOffset={6}
            className="w-max max-w-none p-1"
            viewportClassName="p-0"
          >
            <div className="grid grid-cols-4 gap-0.5" aria-label={`${paneTitle} width presets`}>
              {WORKSPACE_PANE_WIDTH_PRESETS.map((widthPreset) => {
                const label = workspacePaneWidthPresetLabel(widthPreset);
                const isSelected = widthPreset === currentPreset;
                const PresetIcon = workspacePaneWidthPresetIcon(widthPreset);
                return (
                  <PopoverClose
                    key={widthPreset}
                    type="button"
                    className={cn(
                      "relative inline-flex size-8 cursor-pointer items-center justify-center rounded-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
                      isSelected ? "bg-accent text-accent-foreground" : "text-popover-foreground",
                    )}
                    aria-label={`Set ${paneTitle} pane width to ${label}`}
                    aria-pressed={isSelected}
                    title={label}
                    onClick={() => setWorkspacePaneWidth(pane.paneId, widthPreset)}
                  >
                    <PresetIcon className="size-4" />
                    <span className="sr-only">{label}</span>
                    <span
                      className={cn(
                        "absolute right-1 bottom-1 size-1 rounded-full transition-opacity",
                        isSelected ? "bg-current opacity-100" : "opacity-0",
                      )}
                      aria-hidden="true"
                    />
                  </PopoverClose>
                );
              })}
            </div>
          </PopoverPopup>
        </Popover>
      );
    };
    const renderRemovePaneButton = () => (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Delete ${paneTitle} pane`}
              data-testid="delete-workspace-pane-button"
              onClick={() => removeWorkspacePane(pane.paneId)}
            >
              <Trash2Icon className="size-3.5" />
            </button>
          }
        />
        <TooltipPopup side="bottom">Delete pane</TooltipPopup>
      </Tooltip>
    );

    if (pane.type === "editor") {
      const isDefaultEditorPane = pane.paneId === "editor";
      return (
        <WorkspacePane
          key={pane.paneId}
          title={isDefaultEditorPane ? editorPaneTitle : paneTitle}
          onTitleRename={(nextTitle) => renameWorkspacePane(pane.paneId, nextTitle)}
          isActive={isPaneActive}
          leadingActions={renderPaneWidthPresetControl()}
          actions={
            isDefaultEditorPane ? (
              <WorkspaceEditorActions {...workspaceEditorActionProps} />
            ) : (
              renderRemovePaneButton()
            )
          }
          className="min-h-[18rem] xl:min-h-0"
          bodyClassName="min-h-0 flex-col"
        >
          <WorkspaceEditorPane
            key={`${workspaceLayoutKey}:${pane.paneId}:${pane.cwd ?? ""}`}
            environmentId={pane.environmentId as EnvironmentId}
            initialActivePath={pane.metadata.activePath ?? null}
            initialOpenPaths={pane.metadata.openPaths ?? EMPTY_WORKSPACE_EDITOR_OPEN_PATHS}
            openFileRequest={isDefaultEditorPane ? editorOpenFileRequest : null}
            workspaceRoot={pane.cwd ?? undefined}
            resolvedTheme={resolvedTheme}
            {...(isDefaultEditorPane
              ? {
                  onActive: markEditorActive,
                  onWorkspaceStateChange: persistWorkspaceEditorPaneState,
                }
              : {})}
          />
          {isDefaultEditorPane && isGitRepo ? (
            <div className="shrink-0 border-t border-border/60 bg-background">
              <BranchToolbar
                className="max-w-none px-3 py-2 sm:px-4"
                environmentId={activeThread.environmentId}
                threadId={activeThread.id}
                {...(routeKind === "draft" && draftId ? { draftId } : {})}
                onEnvModeChange={onEnvModeChange}
                {...(canOverrideServerThreadEnvMode ? { effectiveEnvModeOverride: envMode } : {})}
                {...(canOverrideServerThreadEnvMode
                  ? {
                      activeThreadBranchOverride: activeThreadBranch,
                      onActiveThreadBranchOverrideChange: setPendingServerThreadBranch,
                    }
                  : {})}
                envLocked={envLocked}
                onComposerFocusRequest={scheduleComposerFocus}
                {...(canCheckoutPullRequestIntoThread
                  ? { onCheckoutPullRequestRequest: openPullRequestDialog }
                  : {})}
                {...(hasMultipleEnvironments ? { onEnvironmentChange } : {})}
                availableEnvironments={logicalProjectEnvironments}
              />
            </div>
          ) : null}
        </WorkspacePane>
      );
    }

    if (pane.type === "terminal") {
      const paneThreadId = ThreadId.make(pane.metadata.threadId ?? activeThread.id);
      const paneThreadRef = scopeThreadRef(pane.environmentId as EnvironmentId, paneThreadId);
      const paneThreadKey = scopedThreadKey(paneThreadRef);
      const paneTerminalState = selectThreadTerminalUiState(
        terminalUiStateByThreadKey,
        paneThreadRef,
      );
      const terminalId =
        pane.metadata.terminalId ||
        paneTerminalState.activeTerminalId ||
        paneTerminalState.terminalIds[0] ||
        DEFAULT_THREAD_TERMINAL_ID;
      const terminalGroup = paneTerminalState.terminalGroups.find(
        (group) => group.id === pane.metadata.terminalGroupId,
      ) ??
        paneTerminalState.terminalGroups.find((group) =>
          group.terminalIds.includes(terminalId),
        ) ?? {
          id: pane.metadata.terminalGroupId ?? `group-${terminalId}`,
          terminalIds: [terminalId],
        };
      const activeTerminalId = terminalGroup.terminalIds.includes(
        paneTerminalState.activeTerminalId,
      )
        ? paneTerminalState.activeTerminalId
        : (terminalGroup.terminalIds[0] ?? terminalId);
      const cwd =
        pane.paneId === "terminal" &&
        paneThreadKey === activeThreadKey &&
        activeTerminalLaunchContext
          ? activeTerminalLaunchContext.cwd
          : (pane.cwd ?? activeWorkspaceRoot);
      const worktreePath =
        pane.paneId === "terminal" &&
        paneThreadKey === activeThreadKey &&
        activeTerminalLaunchContext
          ? activeTerminalLaunchContext.worktreePath
          : paneThreadKey === activeThreadKey
            ? activeThreadWorktreePath
            : null;
      const paneTerminalLabelById = Object.fromEntries(
        paneTerminalState.terminalIds.map((nextTerminalId, index) => [
          nextTerminalId,
          `Terminal ${index + 1}`,
        ]),
      );

      return (
        <WorkspacePane
          key={pane.paneId}
          title={paneTitle}
          onTitleRename={(nextTitle) => renameWorkspacePane(pane.paneId, nextTitle)}
          isActive={isPaneActive}
          leadingActions={renderPaneWidthPresetControl()}
          titleActions={
            <TerminalPaneHeaderActions
              splitCount={terminalGroup.terminalIds.length}
              splitShortcutLabel={splitTerminalShortcutLabel ?? undefined}
              newShortcutLabel={newTerminalShortcutLabel ?? undefined}
              closeShortcutLabel={closeTerminalShortcutLabel ?? undefined}
              onSplitTerminal={() =>
                splitWorkspaceTerminalPane(paneThreadRef, terminalGroup.id, activeTerminalId)
              }
              onNewTerminalPane={() => createNewWorkspaceTerminalPane(pane)}
              onCloseTerminal={() =>
                closeWorkspaceTerminalPane(pane, terminalGroup, activeTerminalId)
              }
            />
          }
          actions={cwd ? <TerminalPanePath fullPath={cwd} /> : null}
          className="min-h-0 flex-1"
          bodyClassName="min-h-0"
        >
          {cwd ? (
            <ThreadTerminalDrawer
              threadRef={paneThreadRef}
              threadId={paneThreadId as ThreadId}
              cwd={cwd}
              worktreePath={worktreePath}
              runtimeEnv={terminalRuntimeEnv}
              layout="pane"
              visible
              height={paneTerminalState.terminalHeight}
              terminalIds={terminalGroup.terminalIds}
              activeTerminalId={activeTerminalId}
              terminalGroups={[terminalGroup]}
              activeTerminalGroupId={terminalGroup.id}
              terminalLabelById={paneTerminalLabelById}
              focusRequestId={terminalFocusRequestId}
              closeShortcutLabel={closeTerminalShortcutLabel ?? undefined}
              keybindings={keybindings}
              onActiveTerminalChange={(terminalId) => {
                storeSetActiveTerminal(paneThreadRef, terminalId);
                storeSetWorkspaceThreadLastActivePane(workspaceLayoutKey, "terminal");
              }}
              onCloseTerminal={(terminalId) =>
                closeWorkspaceTerminalPane(pane, terminalGroup, terminalId)
              }
              onHeightChange={(height) => {
                storeSetTerminalOpen(paneThreadRef, true);
                useTerminalUiStateStore.getState().setTerminalHeight(paneThreadRef, height);
              }}
              onAddTerminalContext={addTerminalContextToDraft}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-muted-foreground text-sm">
              Workspace unavailable
            </div>
          )}
        </WorkspacePane>
      );
    }

    const isDefaultAiPane = pane.paneId === "ai";
    const paneThreadId = pane.metadata.threadId;
    if (paneThreadId === null) {
      const aiPaneTitle = pane.title || "AI";
      return (
        <WorkspacePane
          key={`${pane.paneId}:unbound`}
          title={aiPaneTitle}
          isActive={isPaneActive}
          leadingActions={renderPaneWidthPresetControl()}
          titleActions={
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label="Create new thread in this AI pane"
                    data-testid="ai-pane-new-thread-button"
                    onClick={() => void createScopedAiPaneThread("default", pane.paneId)}
                  >
                    <SquarePenIcon className="size-3.5" />
                  </button>
                }
              />
              <TooltipPopup side="bottom">New thread</TooltipPopup>
            </Tooltip>
          }
          actions={renderRemovePaneButton()}
          className="min-h-[32rem] xl:min-h-0"
        >
          <div className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground text-sm">
            No thread is open in this AI pane.
          </div>
        </WorkspacePane>
      );
    }
    const paneThreadRef = scopeThreadRef(
      pane.environmentId as EnvironmentId,
      paneThreadId as ThreadId,
    );
    const paneThreadKey = scopedThreadKey(paneThreadRef);
    const paneDraftId = draftIdByThreadKey.get(paneThreadKey) ?? null;
    if (!serverThreadKeySet.has(paneThreadKey) && paneDraftId === null) {
      const aiPaneTitle = pane.title || "AI";
      return (
        <WorkspacePane
          key={`${pane.paneId}:missing-thread`}
          title={aiPaneTitle}
          isActive={isPaneActive}
          leadingActions={renderPaneWidthPresetControl()}
          titleActions={
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label="Create new thread in this AI pane"
                    data-testid="ai-pane-new-thread-button"
                    onClick={() => void createScopedAiPaneThread("default", pane.paneId)}
                  >
                    <SquarePenIcon className="size-3.5" />
                  </button>
                }
              />
              <TooltipPopup side="bottom">New thread</TooltipPopup>
            </Tooltip>
          }
          actions={renderRemovePaneButton()}
          className="min-h-[32rem] xl:min-h-0"
        >
          <div className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground text-sm">
            This thread is no longer available.
          </div>
        </WorkspacePane>
      );
    }
    if (!isDefaultAiPane || paneThreadKey !== activeThreadKey) {
      const commonAiPaneProps = {
        environmentId: paneThreadRef.environmentId,
        threadId: paneThreadRef.threadId,
        workspaceMode: "ai-pane" as const,
        embeddedPaneActions: renderRemovePaneButton(),
        embeddedPaneActive: isPaneActive,
        embeddedPaneLeadingActions: renderPaneWidthPresetControl(),
        onWorkspaceAiPaneThreadChange: (
          nextThreadKey: string | null,
          options?: { title?: string },
        ) => handleWorkspaceAiPaneThreadChange(pane.paneId, nextThreadKey, options),
      };
      return paneDraftId ? (
        <ChatView
          key={`${pane.paneId}:${paneThreadKey}`}
          {...commonAiPaneProps}
          routeKind="draft"
          draftId={paneDraftId}
        />
      ) : (
        <ChatView
          key={`${pane.paneId}:${paneThreadKey}`}
          {...commonAiPaneProps}
          routeKind="server"
        />
      );
    }

    return (
      <WorkspacePane
        key={pane.paneId}
        title={activeThread.title}
        isActive={isPaneActive || embeddedPaneActive}
        leadingActions={embeddedPaneLeadingActions ?? renderPaneWidthPresetControl()}
        titleActions={aiPaneHeaderActions}
        titleControl={aiPaneTitleControl}
        titleInputLabel="Thread title"
        titleRenameLabel="Rename thread"
        {...(isServerThread
          ? { onTitleRename: (nextTitle: string | null) => void renameAiThread(nextTitle) }
          : {})}
        actions={embeddedPaneActions}
        rootRef={aiPaneRootRef}
        className="min-h-[32rem] xl:min-h-0"
      >
        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="relative flex min-h-0 flex-1 flex-col">
              <MessagesTimeline
                key={activeThread.id}
                isWorking={isWorking}
                activeTurnInProgress={isWorking || !latestTurnSettled}
                activeTurnId={activeLatestTurn?.turnId ?? null}
                activeTurnStartedAt={activeWorkStartedAt}
                listRef={legendListRef}
                timelineEntries={timelineEntries}
                completionDividerBeforeEntryId={completionDividerBeforeEntryId}
                completionSummary={completionSummary}
                turnDiffSummaryByAssistantMessageId={turnDiffSummaryByAssistantMessageId}
                activeThreadEnvironmentId={activeThread.environmentId}
                routeThreadKey={routeThreadKey}
                onOpenChangedFileInEditor={onOpenChangedFileInEditor}
                onOpenTurnDiff={onOpenTurnDiff}
                revertTurnCountByUserMessageId={revertTurnCountByUserMessageId}
                onRevertUserMessage={onRevertUserMessage}
                isRevertingCheckpoint={isRevertingCheckpoint}
                onImageExpand={onExpandTimelineImage}
                markdownCwd={gitCwd ?? undefined}
                resolvedTheme={resolvedTheme}
                timestampFormat={timestampFormat}
                workspaceRoot={activeWorkspaceRoot}
                skills={activeProviderStatus?.skills ?? EMPTY_PROVIDER_SKILLS}
                onIsAtEndChange={onIsAtEndChange}
              />

              {showScrollToBottom && (
                <div className="pointer-events-none absolute bottom-1 left-1/2 z-30 flex -translate-x-1/2 justify-center py-1.5">
                  <button
                    type="button"
                    onClick={() => scrollToEnd(true)}
                    className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-muted-foreground text-xs shadow-sm transition-colors hover:border-border hover:text-foreground hover:cursor-pointer"
                  >
                    <ChevronDownIcon className="size-3.5" />
                    Scroll to bottom
                  </button>
                </div>
              )}
            </div>

            <div className="pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pl-[calc(env(safe-area-inset-left)+0.75rem)] pr-[calc(env(safe-area-inset-right)+0.75rem)] pt-1.5 sm:pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:pl-[calc(env(safe-area-inset-left)+1.25rem)] sm:pr-[calc(env(safe-area-inset-right)+1.25rem)] sm:pt-2">
              <div className="relative isolate">
                <ComposerBannerStack className="relative z-0" items={composerBannerItems} />
                <div className="relative z-10">
                  <ChatComposer
                    composerRef={composerRef}
                    composerDraftTarget={composerDraftTarget}
                    environmentId={environmentId}
                    routeKind={routeKind}
                    routeThreadRef={routeThreadRef}
                    draftId={draftId}
                    activeThreadId={activeThreadId}
                    activeThreadEnvironmentId={activeThread?.environmentId}
                    activeThread={activeThread}
                    isServerThread={isServerThread}
                    isLocalDraftThread={isLocalDraftThread}
                    phase={phase}
                    isConnecting={isConnecting}
                    isSendBusy={isSendBusy}
                    isPreparingWorktree={isPreparingWorktree}
                    environmentUnavailable={activeEnvironmentUnavailableState}
                    activePendingApproval={activePendingApproval}
                    pendingApprovals={pendingApprovals}
                    pendingUserInputs={pendingUserInputs}
                    activePendingProgress={activePendingProgress}
                    activePendingResolvedAnswers={activePendingResolvedAnswers}
                    activePendingIsResponding={activePendingIsResponding}
                    activePendingDraftAnswers={activePendingDraftAnswers}
                    activePendingQuestionIndex={activePendingQuestionIndex}
                    respondingRequestIds={respondingRequestIds}
                    showPlanFollowUpPrompt={showPlanFollowUpPrompt}
                    activeProposedPlan={activeProposedPlan}
                    activePlan={activePlan as { turnId?: TurnId } | null}
                    sidebarProposedPlan={sidebarProposedPlan as { turnId?: TurnId } | null}
                    planSidebarLabel={planSidebarLabel}
                    planSidebarOpen={planSidebarOpen}
                    runtimeMode={runtimeMode}
                    interactionMode={interactionMode}
                    lockedProvider={lockedProvider}
                    providerStatuses={providerStatusesForChat as ServerProvider[]}
                    activeProjectDefaultModelSelection={activeProject?.defaultModelSelection}
                    activeThreadModelSelection={activeThread?.modelSelection}
                    activeThreadActivities={activeThread?.activities}
                    resolvedTheme={resolvedTheme}
                    settings={settings}
                    keybindings={keybindings}
                    terminalOpen={Boolean(terminalState.terminalOpen)}
                    gitCwd={gitCwd}
                    promptRef={promptRef}
                    composerImagesRef={composerImagesRef}
                    composerTerminalContextsRef={composerTerminalContextsRef}
                    shouldAutoScrollRef={isAtEndRef}
                    scheduleStickToBottom={scrollToEnd}
                    onSend={onSend}
                    onInterrupt={onInterrupt}
                    onImplementPlanInNewThread={onImplementPlanInNewThread}
                    onRespondToApproval={onRespondToApproval}
                    onSelectActivePendingUserInputOption={onSelectActivePendingUserInputOption}
                    onAdvanceActivePendingUserInput={onAdvanceActivePendingUserInput}
                    onPreviousActivePendingUserInputQuestion={
                      onPreviousActivePendingUserInputQuestion
                    }
                    onChangeActivePendingUserInputCustomAnswer={
                      onChangeActivePendingUserInputCustomAnswer
                    }
                    onProviderModelSelect={onProviderModelSelect}
                    toggleInteractionMode={toggleInteractionMode}
                    handleRuntimeModeChange={handleRuntimeModeChange}
                    handleInteractionModeChange={handleInteractionModeChange}
                    togglePlanSidebar={togglePlanSidebar}
                    focusComposer={focusComposer}
                    scheduleComposerFocus={scheduleComposerFocus}
                    setThreadError={setThreadError}
                    onExpandImage={onExpandTimelineImage}
                  />
                </div>
              </div>
            </div>

            {pullRequestDialogState ? (
              <PullRequestThreadDialog
                key={pullRequestDialogState.key}
                open
                environmentId={activeThread.environmentId}
                threadId={activeThread.id}
                cwd={activeProject?.cwd ?? null}
                initialReference={pullRequestDialogState.initialReference}
                onOpenChange={(open) => {
                  if (!open) {
                    closePullRequestDialog();
                  }
                }}
                onPrepared={handlePreparedPullRequestThread}
              />
            ) : null}
          </div>

          {planSidebarOpen && !shouldUsePlanSidebarSheet ? (
            <PlanSidebar
              activePlan={activePlan}
              activeProposedPlan={sidebarProposedPlan}
              label={planSidebarLabel}
              environmentId={environmentId}
              markdownCwd={gitCwd ?? undefined}
              workspaceRoot={activeWorkspaceRoot}
              timestampFormat={timestampFormat}
              mode="sidebar"
              onClose={closePlanSidebar}
            />
          ) : null}
        </div>
      </WorkspacePane>
    );
  };

  if (workspaceMode === "ai-pane") {
    const aiPane = fallbackWorkspaceDockedPanes.find((pane) => pane.type === "ai");
    return (
      <>
        {aiPane ? renderWorkspacePane(aiPane) : null}
        {shouldUsePlanSidebarSheet ? (
          <RightPanelSheet open={planSidebarOpen} onClose={closePlanSidebar}>
            <PlanSidebar
              activePlan={activePlan}
              activeProposedPlan={sidebarProposedPlan}
              label={planSidebarLabel}
              environmentId={environmentId}
              markdownCwd={gitCwd ?? undefined}
              workspaceRoot={activeWorkspaceRoot}
              timestampFormat={timestampFormat}
              mode="sheet"
              onClose={closePlanSidebar}
            />
          </RightPanelSheet>
        ) : null}
        {expandedImage && (
          <ExpandedImageDialog preview={expandedImage} onClose={closeExpandedImage} />
        )}
      </>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header
        className={cn(
          "border-b border-border",
          isElectron
            ? cn(
                "drag-region flex h-[52px] items-center pr-3 sm:pr-5 wco:h-[env(titlebar-area-height)]",
                sidebarOpen
                  ? "pl-3 sm:pl-5"
                  : "pl-[90px] sm:pl-[90px] wco:pl-[calc(env(titlebar-area-x)+1em)]",
                reserveTitleBarControlInset &&
                  "wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]",
              )
            : "pb-2 pl-[calc(env(safe-area-inset-left)+0.75rem)] pr-[calc(env(safe-area-inset-right)+0.75rem)] pt-2 sm:pb-3 sm:pl-[calc(env(safe-area-inset-left)+1.25rem)] sm:pr-[calc(env(safe-area-inset-right)+1.25rem)] sm:pt-3",
        )}
      >
        <ChatHeader
          actions={
            <WorkspaceHeaderPaneActions
              diffOpen={diffOpen}
              diffToggleShortcutLabel={diffPanelShortcutLabel}
              isGitRepo={isGitRepo}
              runningTerminalThreadRefs={workspaceRunningTerminalThreadRefs}
              onAddPane={() => setAddPaneDialogOpen(true)}
              onToggleDiff={onToggleDiff}
            />
          }
          activeThreadTitle={activeThread.title}
          workspaceName={workspaceName}
          showThreadTitle={false}
        />
      </header>

      <ProviderStatusBanner status={activeProviderStatus} />
      <ThreadErrorBanner
        error={activeThread.error}
        onDismiss={() => setThreadError(activeThread.id, null)}
      />
      <AddWorkspacePaneDialog
        environmentId={activeThread.environmentId}
        currentWorkspaceRoot={activeWorkspaceRoot}
        open={addPaneDialogOpen}
        workspaceName={workspaceName}
        onCreate={addWorkspacePane}
        onOpenChange={setAddPaneDialogOpen}
      />
      <WorkspacePaneHost
        key={workspaceLayoutKey}
        activePaneId={activeWorkspaceDockedPaneId}
        panes={renderedWorkspaceDockedPanes}
        renderPane={renderWorkspacePane}
        scrollLeft={workspacePaneStripScrollLeft}
        terminalRowHeight={terminalPaneDeckHeight}
        onActivePaneChange={(paneId) =>
          storeSetWorkspaceThreadActiveDockedPane(workspaceLayoutKey, paneId)
        }
        onPanesChange={handleWorkspacePanesChange}
        onScrollLeftChange={(scrollLeft) =>
          storeSetWorkspaceThreadPaneStripScrollLeft(workspaceLayoutKey, scrollLeft)
        }
      />

      {hiddenMountedTerminalThreadRefs.map(
        ({ key: mountedThreadKey, threadRef: mountedThreadRef }) => (
          <PersistentThreadTerminalPaneDeck
            key={mountedThreadKey}
            threadRef={mountedThreadRef}
            threadId={mountedThreadRef.threadId}
            visible={false}
            launchContext={null}
            focusRequestId={0}
            splitShortcutLabel={splitTerminalShortcutLabel ?? undefined}
            newShortcutLabel={newTerminalShortcutLabel ?? undefined}
            closeShortcutLabel={closeTerminalShortcutLabel ?? undefined}
            keybindings={keybindings}
            onAddTerminalContext={addTerminalContextToDraft}
          />
        ),
      )}
      {shouldUsePlanSidebarSheet ? (
        <RightPanelSheet open={planSidebarOpen} onClose={closePlanSidebar}>
          <PlanSidebar
            activePlan={activePlan}
            activeProposedPlan={sidebarProposedPlan}
            label={planSidebarLabel}
            environmentId={environmentId}
            markdownCwd={gitCwd ?? undefined}
            workspaceRoot={activeWorkspaceRoot}
            timestampFormat={timestampFormat}
            mode="sheet"
            onClose={closePlanSidebar}
          />
        </RightPanelSheet>
      ) : null}

      {expandedImage && (
        <ExpandedImageDialog preview={expandedImage} onClose={closeExpandedImage} />
      )}
    </div>
  );
}
