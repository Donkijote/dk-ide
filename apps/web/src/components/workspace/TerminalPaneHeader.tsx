import { PlusIcon, SquareSplitHorizontalIcon, Trash2Icon } from "lucide-react";
import { type ReactNode } from "react";

import { MAX_TERMINALS_PER_GROUP } from "../../types";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface TerminalPaneHeaderActionsProps {
  readonly closeShortcutLabel?: string | undefined;
  readonly newShortcutLabel?: string | undefined;
  readonly onCloseTerminal: () => void;
  readonly onNewTerminalPane: () => void;
  readonly onSplitTerminal: () => void;
  readonly splitCount: number;
  readonly splitShortcutLabel?: string | undefined;
}

interface TerminalPaneHeaderButtonProps {
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}

interface TerminalPanePathProps {
  readonly fullPath: string;
}

export function resolveNewTerminalPaneActionLabel(shortcutLabel?: string): string {
  return shortcutLabel ? `New Terminal Pane (${shortcutLabel})` : "New Terminal Pane";
}

export function resolveTerminalPanePathLabel(fullPath: string): string {
  const trimmedPath = fullPath.replace(/[\\/]+$/g, "");
  const segments = trimmedPath.split(/[\\/]+/g).filter(Boolean);
  if (segments.length === 0) {
    return fullPath;
  }
  return segments.slice(-2).join("/");
}

function TerminalPaneHeaderButton({
  children,
  destructive = false,
  disabled = false,
  label,
  onClick,
}: TerminalPaneHeaderButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className={
              destructive
                ? "inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive aria-disabled:cursor-not-allowed aria-disabled:opacity-45"
                : "inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-45"
            }
            aria-label={label}
            aria-disabled={disabled}
            onClick={() => {
              if (!disabled) {
                onClick();
              }
            }}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
}

export function TerminalPaneHeaderActions({
  closeShortcutLabel,
  newShortcutLabel,
  onCloseTerminal,
  onNewTerminalPane,
  onSplitTerminal,
  splitCount,
  splitShortcutLabel,
}: TerminalPaneHeaderActionsProps) {
  const splitLimitReached = splitCount >= MAX_TERMINALS_PER_GROUP;
  const splitLabel = splitLimitReached
    ? `Split Terminal (max ${MAX_TERMINALS_PER_GROUP} per pane)`
    : splitShortcutLabel
      ? `Split Terminal (${splitShortcutLabel})`
      : "Split Terminal";
  const closeLabel = closeShortcutLabel
    ? `Close Terminal (${closeShortcutLabel})`
    : "Close Terminal";

  return (
    <>
      <TerminalPaneHeaderButton
        disabled={splitLimitReached}
        label={splitLabel}
        onClick={onSplitTerminal}
      >
        <SquareSplitHorizontalIcon className="size-3.5" />
      </TerminalPaneHeaderButton>
      <TerminalPaneHeaderButton
        label={resolveNewTerminalPaneActionLabel(newShortcutLabel)}
        onClick={onNewTerminalPane}
      >
        <PlusIcon className="size-3.5" />
      </TerminalPaneHeaderButton>
      <TerminalPaneHeaderButton destructive label={closeLabel} onClick={onCloseTerminal}>
        <Trash2Icon className="size-3.5" />
      </TerminalPaneHeaderButton>
    </>
  );
}

export function TerminalPanePath({ fullPath }: TerminalPanePathProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="max-w-[34vw] cursor-default truncate rounded-sm font-mono text-[11px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={`Terminal path: ${fullPath}`}
          />
        }
      >
        {resolveTerminalPanePathLabel(fullPath)}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{fullPath}</TooltipPopup>
    </Tooltip>
  );
}
