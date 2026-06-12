"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  CircleDot,
  FolderGit2,
  ChevronsUpDown,
  Check,
  FolderOpen,
  Settings,
} from "lucide-react";

import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceRoot, repoName } from "@/lib/workspace-root";
import { cn } from "@/lib/utils";

// Nav (DEC-014): Issues / Repo. Issues is the spine. Repo is the workspace.
// The cross-cutting Decisions view was removed — per-issue logs live in each
// issue's thread; there's no need to browse decisions across issues.
const nav = [
  { key: "issues", label: "Issues", icon: CircleDot, href: "/issues" },
  { key: "repo", label: "Repo", icon: FolderGit2, href: "/workspace" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { rootName, root, recents, openRoot, switchTo } = useWorkspaceRoot();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex h-12 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-sm group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0!">
              <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-foreground text-background">
                <span className="text-sm font-bold">c</span>
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">continuum</span>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>ワークスペース</SidebarGroupLabel>
          <SidebarMenu>
            {nav.map((item) => {
              const active =
                item.href === "/workspace"
                  ? pathname.startsWith("/workspace")
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
              return (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={active}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="設定">
              <Settings />
              <span>設定</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Repo switcher (Obsidian vault-style): the whole row is clickable;
            clicking opens a dropdown of recently-used repos (frequency order,
            current one checked) + "Open folder…" to add/switch to a new one. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            title={root ?? "Open a repo"}
            className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md p-1.5 text-left outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
          >
            <span className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <FolderGit2 className="size-4" />
            </span>
            <div className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-medium">
                {rootName ?? "Open a repo…"}
              </span>
              {root && (
                <span className="truncate text-xs text-muted-foreground">
                  {root}
                </span>
              )}
            </div>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="min-w-56">
            {recents.map((r) => (
              <DropdownMenuItem
                key={r.path}
                onClick={() => switchTo(r.path)}
                className="cursor-pointer gap-2 px-2 py-1.5 transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Check
                  className={cn(
                    "size-4",
                    r.path === root ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="truncate" title={r.path}>
                  {repoName(r.path)}
                </span>
              </DropdownMenuItem>
            ))}
            {recents.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={() => void openRoot()}
              className="cursor-pointer gap-2 px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <FolderOpen className="size-4" />
              Open folder…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
