"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// continuum's product surface is the workspace editor. The old "Design Issues"
// demo list (dummy data) lives in git history; the root now enters /workspace.
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/workspace");
  }, [router]);
  return (
    <div className="flex h-svh items-center justify-center text-sm text-muted-foreground">
      Opening workspace…
    </div>
  );
}
