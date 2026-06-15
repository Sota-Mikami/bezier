"use client";

// Installs window-level error / unhandledrejection handlers that append to the
// local log file. Renders nothing. Mounted once from the root layout.

import { useEffect } from "react";
import { installGlobalErrorLogging } from "@/lib/log";

export function ErrorLogger() {
  useEffect(() => {
    installGlobalErrorLogging();
  }, []);
  return null;
}
