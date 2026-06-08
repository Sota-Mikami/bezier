import * as React from "react"

const MOBILE_BREAKPOINT = 768

const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches
}

// Server / pre-hydration snapshot: assume desktop.
function getServerSnapshot(): boolean {
  return false
}

export function useIsMobile() {
  // Subscribing to the media query via an external store keeps the read in
  // render (no setState-in-effect) and stays SSR-safe via getServerSnapshot.
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
