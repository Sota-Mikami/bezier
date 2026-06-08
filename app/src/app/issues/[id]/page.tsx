import { Suspense } from "react";
import { issues } from "@/lib/data";
import IssueClient from "./issue-client";

// Static export: pre-render one HTML file per issue id.
export function generateStaticParams() {
  return issues.map((issue) => ({ id: issue.id }));
}

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // IssueClient uses useSearchParams(); it must live under a Suspense boundary.
  return (
    <Suspense>
      <IssueClient id={id} />
    </Suspense>
  );
}
