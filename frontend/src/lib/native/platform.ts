"use client";
/**
 * Native platform detection — Phase 4 W9.
 *
 * The same bundle runs in a browser and inside the Android shell, so every
 * native call has to be guarded. Importing a Capacitor plugin is safe in the
 * browser (the packages ship web fallbacks or no-ops); *calling* one that has
 * no web implementation throws, which is what these guards prevent.
 */
import { Capacitor } from "@capacitor/core";

/** True only inside the Capacitor shell, not in a mobile browser. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function platform(): "android" | "ios" | "web" {
  return Capacitor.getPlatform() as "android" | "ios" | "web";
}

/** True when a specific plugin is actually available on this platform. */
export function hasPlugin(name: string): boolean {
  return Capacitor.isPluginAvailable(name);
}
