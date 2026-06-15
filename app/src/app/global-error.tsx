"use client";

// Catastrophic error boundary — catches errors thrown in the root layout itself,
// which replaces the layout entirely. It must render its own <html>/<body> and
// must NOT depend on globals.css or app components (they may be the thing that
// broke), so styles are inline. Logging is LOCAL ONLY; no external telemetry.

import { useEffect } from "react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[bezier] global error:", error);
    void import("@/lib/log").then((m) => m.logClientError("global", error));
  }, [error]);

  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Hiragino Sans', Meiryo, sans-serif",
          background: "#0b0b0c",
          color: "#e7e7e9",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>
            アプリの起動に問題が発生しました
          </h2>
          <p style={{ fontSize: 13, opacity: 0.7, margin: "0 0 20px", lineHeight: 1.6 }}>
            予期しないエラーでアプリ全体が停止しました。再起動してください。直らない場合はログ（アプリのデータフォルダ）を確認できます。
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              border: "1px solid #3a3a3e",
              background: "#1a1a1c",
              color: "#e7e7e9",
              borderRadius: 6,
              padding: "8px 14px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            再起動
          </button>
        </div>
      </body>
    </html>
  );
}
