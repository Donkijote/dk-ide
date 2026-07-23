import type { ProviderInstanceId } from "@t3tools/contracts";
import { memo, useMemo } from "react";

import { getAppModelOptionConfigForInstanceEntry } from "../../modelSelection";
import type { ProjectProviderResolution } from "../../projectProviderSelection";
import { isSelectableProjectProviderEntry } from "../../projectProviderSelection";
import type { ProviderInstanceEntry } from "../../providerInstances";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
} from "../ui/select";

function providerAvailabilityLabel(entry: ProviderInstanceEntry): string {
  if (!entry.enabled) return "Disabled in settings";
  if (!entry.isAvailable) return "Unavailable";
  if (entry.status === "error") return entry.snapshot.message?.trim() || "Unavailable";
  if (entry.status === "warning") return entry.snapshot.message?.trim() || "Limited";
  if (entry.status !== "ready") return "Not ready";
  return entry.isDefault ? "Built-in provider" : "Configured provider";
}

export const WorkspaceProviderSelector = memo(function WorkspaceProviderSelector(props: {
  entries: ReadonlyArray<ProviderInstanceEntry>;
  resolution: ProjectProviderResolution;
  saving?: boolean;
  onProviderChange: (instanceId: ProviderInstanceId) => void;
}) {
  const activeEntry = props.resolution.effectiveEntry;
  const duplicateDriverCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of props.entries) {
      counts.set(entry.driverKind, (counts.get(entry.driverKind) ?? 0) + 1);
    }
    return counts;
  }, [props.entries]);
  const claudeProjectConfigDetected = props.entries.some(
    (entry) => getAppModelOptionConfigForInstanceEntry(entry)?.includeClaudeProjectConfig === true,
  );

  if (!activeEntry) {
    return null;
  }

  const activeDetail = props.resolution.usesClaudeProjectConfig
    ? "Project .claude config"
    : props.resolution.isFallback
      ? "Fallback provider"
      : "Workspace default";
  const triggerLabel = `Workspace AI provider: ${activeEntry.displayName}. ${activeDetail}.`;

  return (
    <Select
      modal={false}
      value={activeEntry.instanceId}
      onValueChange={(value) => {
        if (value) props.onProviderChange(value as ProviderInstanceId);
      }}
    >
      <SelectTrigger
        aria-label={triggerLabel}
        title={triggerLabel}
        variant="ghost"
        size="xs"
        disabled={props.saving}
        data-workspace-provider-selector="true"
        className="max-w-52 border border-border/50 bg-background/35 font-medium"
      >
        <ProviderInstanceIcon
          driverKind={activeEntry.driverKind}
          displayName={activeEntry.displayName}
          accentColor={activeEntry.accentColor}
          showBadge={(duplicateDriverCounts.get(activeEntry.driverKind) ?? 0) > 1}
          className="size-4"
          iconClassName="size-3.5"
          badgeClassName="h-2.5 min-w-2.5 text-[6px]"
        />
        <span className="min-w-0 truncate">
          <span className="text-muted-foreground/65">AI&nbsp;·&nbsp;</span>
          {activeEntry.displayName}
        </span>
        {props.resolution.usesClaudeProjectConfig ? (
          <span className="hidden rounded-sm bg-primary/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary lg:inline">
            Project
          </span>
        ) : props.resolution.isFallback ? (
          <span className="hidden rounded-sm bg-amber-500/12 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 lg:inline">
            Fallback
          </span>
        ) : null}
      </SelectTrigger>
      <SelectPopup align="start" alignItemWithTrigger={false} className="min-w-72">
        <SelectGroup>
          <SelectGroupLabel>Workspace default AI provider</SelectGroupLabel>
          {props.entries.map((entry) => {
            const selectable = isSelectableProjectProviderEntry(entry);
            const usesProjectConfig =
              getAppModelOptionConfigForInstanceEntry(entry)?.includeClaudeProjectConfig === true;
            const showBadge = (duplicateDriverCounts.get(entry.driverKind) ?? 0) > 1;
            return (
              <SelectItem
                key={entry.instanceId}
                value={entry.instanceId}
                disabled={!selectable}
                className="py-1.5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ProviderInstanceIcon
                    driverKind={entry.driverKind}
                    displayName={entry.displayName}
                    accentColor={entry.accentColor}
                    showBadge={showBadge}
                    className="size-5"
                    iconClassName="size-4"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{entry.displayName}</span>
                    <span className="block truncate text-muted-foreground text-xs">
                      {usesProjectConfig
                        ? "Uses the detected .claude project configuration"
                        : entry.driverKind !== "claudeAgent" && claudeProjectConfigDetected
                          ? "Does not use the detected .claude configuration"
                          : providerAvailabilityLabel(entry)}
                    </span>
                  </span>
                </span>
              </SelectItem>
            );
          })}
        </SelectGroup>
      </SelectPopup>
    </Select>
  );
});
