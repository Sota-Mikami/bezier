"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Inbox,
  SquareKanban,
  Boxes,
  FolderTree,
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
  SidebarMenuBadge,
  SidebarRail,
} from "@/components/ui/sidebar";
import { repos } from "@/lib/data";

const nav = [
  { key: "inbox", label: "Inbox", icon: Inbox, href: "/inbox", unread: "2" },
  { key: "issues", label: "Design Issues", icon: SquareKanban, href: "/", count: "6" },
  { key: "library", label: "Components", icon: Boxes, href: "/library", count: "230" },
  { key: "workspace", label: "Workspace", icon: FolderTree, href: "/workspace" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const isIssues = pathname === "/" || pathname.startsWith("/issues");

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
              const active = item.key === "issues" ? isIssues : pathname === item.href;
              return (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={active}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                    {item.count && (
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {item.count}
                      </span>
                    )}
                  </SidebarMenuButton>
                  {item.unread && <SidebarMenuBadge>{item.unread}</SidebarMenuBadge>}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="mt-2">
          <SidebarGroupLabel>接続済みリポジトリ</SidebarGroupLabel>
          <SidebarMenu>
            {repos.map((r) => (
              <SidebarMenuItem key={r.key}>
                <SidebarMenuButton size="lg" tooltip={`${r.owner}/${r.name}`}>
                  <span className="flex aspect-square size-8 items-center justify-center rounded-md border bg-muted text-[11px] font-semibold">
                    {r.owner[0].toUpperCase()}
                  </span>
                  <div className="grid flex-1 leading-tight">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="size-1.5 rounded-full bg-foreground/45" />
                      {r.owner}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {r.name} · {r.components} 部品
                    </span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
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
