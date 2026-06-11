"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Landing = Issues (the spine, 要件 §1). The old "Design Issues" demo list lives
// in git history; the Repo IDE workspace is reachable from the nav (/workspace).
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/issues");
  }, [router]);
  return (
    <div className="flex h-svh items-center justify-center text-sm text-muted-foreground">
      Opening issues…
    </div>
  );
}
