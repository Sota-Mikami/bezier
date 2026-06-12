"use client";

// The app's own title bar (DEC-024). With the native title bar transparent
// (titleBarStyle: Overlay), this thin fixed bar spans the window top: the macOS
// traffic lights float at the far left, then the sidebar collapse toggle. The
// whole strip is a drag region so the window still moves. The sidebar + content
// are offset below it (--titlebar-h, see globals.css), so nothing hides under it.

import { SidebarTrigger } from "@/components/ui/sidebar";

export function AppTitlebar() {
  return (
    <div
      data-tauri-drag-region
      className="fixed inset-x-0 top-0 z-50 flex h-[var(--titlebar-h)] items-center border-b bg-background/70 pl-[78px] backdrop-blur"
    >
      <SidebarTrigger className="size-6 text-muted-foreground" />
    </div>
  );
}
