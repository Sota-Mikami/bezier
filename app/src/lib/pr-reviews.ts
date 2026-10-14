import { invoke } from "@tauri-apps/api/core";

export interface PrReviewData {
  prNumber: number;
  prState: "OPEN" | "CLOSED" | "MERGED";
  reviewDecision:
    | "APPROVED"
    | "CHANGES_REQUESTED"
    | "REVIEW_REQUIRED"
    | "COMMENTED"
    | null;
  reviewers: {
    login: string;
    state:
      | "APPROVED"
      | "CHANGES_REQUESTED"
      | "COMMENTED"
      | "DISMISSED"
      | "PENDING";
    submittedAt: string;
  }[];
  ciChecks: {
    name: string;
    state: string;
    description: string;
  }[];
  threads: {
    id: string;
    isResolved: boolean;
    path: string;
    line: number | null;
    originalLine: number | null;
    diffHunk: string;
    initiatingComment: {
      id: string;
      author: string;
      body: string;
      createdAt: string;
    };
    replyCount: number;
  }[];
}

export function ghPrReviews(
  repoPath: string,
  branch: string,
): Promise<PrReviewData> {
  return invoke<PrReviewData>("gh_pr_reviews", { repoPath, branch });
}
