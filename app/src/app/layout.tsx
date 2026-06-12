import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/app-sidebar";
import { WorkspaceRootProvider } from "@/lib/workspace-root";
import { ReloadShortcut } from "@/components/reload-shortcut";

// next/font/google fetches font files at build time, which fails on offline /
// static-export builds. Use a system font stack via CSS variables instead.
const FONT_SANS =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif";
const FONT_MONO =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

export const metadata: Metadata = {
  title: "continuum — Spec→Design→Mock→QA",
  description: "AI-native maker tool. Spec-driven, repo-aware.",
};

// Follow the OS light/dark setting (no manual toggle). Toggles `.dark` on <html>
// synchronously (before paint -> no flash) and live-updates when the device
// preference changes. The design system is class-based (.dark in globals.css).
const THEME_SYNC = `(function(){try{var m=window.matchMedia('(prefers-color-scheme: dark)');var a=function(){document.documentElement.classList.toggle('dark',m.matches);};a();m.addEventListener('change',a);}catch(e){}})();`;

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
          <ReloadShortcut />
          <WorkspaceRootProvider>
            <SidebarProvider>
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
