import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTitlebar } from "@/components/app-titlebar";
import { WorkspaceRootProvider } from "@/lib/workspace-root";
import { ReloadShortcut } from "@/components/reload-shortcut";
import { AppCloseGuard } from "@/components/app-close-guard";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { ThemeKeeper } from "@/lib/settings";

// next/font/google fetches font files at build time, which fails on offline /
// static-export builds. Use a system font stack via CSS variables instead.
const FONT_SANS =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif";
const FONT_MONO =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

export const metadata: Metadata = {
  title: "Bezier — Hold the handles",
  description:
    "プロダクトデザイナー & PdM のためのエージェント・ワークベンチ。ハンドルを握る。曲線はエージェントが描く。",
};

// Apply the saved theme preference (light / dark / system) BEFORE paint so there
// is no flash. Reads `bezier:theme` from localStorage (written by settings.tsx);
// "system" (or unset) follows the OS and live-updates. The design system is
// class-based (.dark in globals.css); <ThemeKeeper/> takes over after hydration.
const THEME_SYNC = `(function(){try{var pref=localStorage.getItem('bezier:theme')||'system';var m=window.matchMedia('(prefers-color-scheme: dark)');var a=function(){var dark=pref==='dark'||(pref==='system'&&m.matches);document.documentElement.classList.toggle('dark',dark);};a();m.addEventListener('change',function(){if(pref==='system')a();});}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className="h-full antialiased"
      style={
        {
          "--font-geist-sans": FONT_SANS,
          "--font-geist-mono": FONT_MONO,
          "--font-sans": FONT_SANS,
          "--font-mono": FONT_MONO,
        } as React.CSSProperties
      }
    >
      <body className="min-h-full font-sans">
        <script dangerouslySetInnerHTML={{ __html: THEME_SYNC }} />
        <TooltipProvider delay={0}>
          <ThemeKeeper />
          <ReloadShortcut />
          <AppCloseGuard />
          <ShortcutsDialog />
          <WorkspaceRootProvider>
            <SidebarProvider className="box-border h-svh overflow-hidden pt-[var(--titlebar-h)]">
              <AppTitlebar />
              <Suspense fallback={null}>
                <AppSidebar />
              </Suspense>
              <SidebarInset>{children}</SidebarInset>
            </SidebarProvider>
          </WorkspaceRootProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
