import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes intelligently — later classes win over earlier ones
 * even when the same property is set twice. Used by every primitive so a
 * caller's `className` can override the primitive's own defaults without
 * fighting specificity.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
