export const mobileLayoutRules = {
  navigation: "bottom-bar",
  contentPaddingPx: 16,
  minimumTapTargetPx: 44,
  narrowViewportBreakpointPx: 640,
} as const;

export function clampMobileColumns(viewportWidth: number): 1 | 2 {
  return viewportWidth < mobileLayoutRules.narrowViewportBreakpointPx ? 1 : 2;
}
