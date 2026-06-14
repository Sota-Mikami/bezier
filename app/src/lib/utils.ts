import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// True in the `tauri dev` build (next dev → NODE_ENV=development), false in the
// shipped .app (static export → production). Used to visibly mark the dev build
// so it's never mistaken for the real app you dogfood. Inlined at build time.
export const IS_DEV = process.env.NODE_ENV !== "production"
