import type { Metadata } from "next";
import "./globals.css";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/app-sidebar";

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
        <TooltipProvider delay={0}>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>{children}</SidebarInset>
          </SidebarProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
