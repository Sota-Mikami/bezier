"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  CircleDot,
  ScrollText,
  FolderGit2,
  ChevronsUpDown,
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

// Improvement-loop axis (要件 §1, Concept A): Issues / Decisions / Repo.
// Issues is the spine (slice 1). Repo is the existing IDE workspace.
// (Product returns at slice 3.)
const nav = [
  { key: "issues", label: "Issues", icon: CircleDot, href: "/issues" },
  { key: "decisions", label: "Decisions", icon: ScrollText, href: "/decisions" },
  { key: "repo", label: "Repo", icon: FolderGit2, href: "/workspace" },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-foreground text-background">
                <span className="text-sm font-bold">c</span>
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">continuum</span>
                <span className="truncate text-xs text-muted-foreground">
                  三上奏太 · Personal
                </span>
              </div>
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </SidebarMenuButton>
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
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <span className="flex aspect-square size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                奏
              </span>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">三上奏太</span>
                <span className="truncate text-xs text-muted-foreground">CEO</span>
              </div>
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
