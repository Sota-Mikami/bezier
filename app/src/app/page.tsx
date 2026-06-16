"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Landing = Issues (the spine, 要件 §1). The old "Design Issues" demo list and
// the standalone /workspace Repo-IDE surface live in git history (removed once
// the product became issue-centric).
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
