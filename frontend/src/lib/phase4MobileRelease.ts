export type MobileState = "loading" | "empty" | "error" | "ready";

export const mobileReleaseChecklist = {
  states: ["loading", "empty", "error", "ready"] as MobileState[],
  preserveReadableText: true,
  preventHorizontalOverflow: true,
  browsers: ["chrome-mobile", "safari-mobile"],
} as const;
