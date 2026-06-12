// The Bezier mark — a pen-tool bézier curve with its two control-point handles.
// The curve (currentColor) is the agent's output; the handles + control dots
// (--primary, the "handle" indigo) are what you hold. Theme-aware by design:
// pass text color via className (the curve follows currentColor).
// See design/brand/logo/.

export function BezierMark({
  className,
  title = "Bezier",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label={title}
      className={className}
    >
      {/* curve = agent output */}
      <path
        d="M11 35 C24 35 24 13 37 13"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* handles = the tangent lines you hold */}
      <g stroke="var(--primary)" strokeWidth="2.2" strokeLinecap="round">
        <path d="M11 35 L24 35" />
        <path d="M37 13 L24 13" />
      </g>
      <circle cx="24" cy="35" r="2" fill="var(--primary)" />
      <circle cx="24" cy="13" r="2" fill="var(--primary)" />
      {/* anchors (on-curve, square) */}
      <rect x="9" y="33" width="4" height="4" rx="0.8" fill="currentColor" />
      <rect x="35" y="11" width="4" height="4" rx="0.8" fill="currentColor" />
    </svg>
  );
}

// Mark + "Bezier" wordmark lockup (horizontal). Used in the title bar / about.
export function BezierWordmark({ className }: { className?: string }) {
  return (
    <span className={"inline-flex items-center gap-1.5 " + (className ?? "")}>
      <BezierMark className="size-[18px]" />
      <span className="text-[13px] font-semibold tracking-tight">Bezier</span>
    </span>
  );
}
