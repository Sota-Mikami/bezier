"use client";

// Base-branch picker (DEC-145): the searchable combobox for choosing the branch a
// new issue is cut from + that Sync / Merge / PR target. Repos can have many
// branches, so it filters + has a no-terminal refresh (re-fetches origin/*). Now a
// thin wrapper over the shared <SearchableSelect> (DEC-149) so it reads identically
// to the New-issue modal's folder picker.

import * as React from "react";
import { GitBranch } from "lucide-react";
import { useT } from "@/lib/i18n";
import { SearchableSelect } from "@/components/ui/searchable-select";

export function BaseBranchPicker({
  value,
  branches,
  onChange,
  onRefresh,
  refreshing,
  placement = "down",
  align = "right",
}: {
  value: string;
  branches: string[];
  onChange: (b: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  /** Which way the dropdown opens. Default "down". */
  placement?: "down" | "up";
  /** Which edge the panel aligns to. Default "right" (the agent-panel header). */
  align?: "left" | "right";
}) {
  const t = useT();
  const items = React.useMemo(
    () => branches.map((b) => ({ value: b, label: b })),
    [branches],
  );
  return (
    <SearchableSelect
      value={value}
      items={items}
      onChange={onChange}
      icon={<GitBranch className="size-3" />}
      label={t("agentPanel.baseLabel")}
      searchPlaceholder={t("agentPanel.baseSearch")}
      emptyText={t("agentPanel.baseNoMatch")}
      triggerTitle={t("agentPanel.baseTip")}
      placement={placement}
      align={align}
      monoList
      onRefresh={onRefresh}
      refreshing={refreshing}
      refreshLabel={t("agentPanel.baseRefresh")}
    />
  );
}
