"use client";
/**
 * Photo capture — Phase 4 W10.
 *
 * On Android this opens the native camera or gallery through the Capacitor
 * Camera plugin. In a browser it falls back to a file input, so the same
 * calling code works on both and no screen needs two upload paths.
 *
 * Returns a `File`, because that is what the existing Cloudinary upload flow
 * already takes. Converting here rather than at each call site keeps the
 * native detail out of the components.
 */
import type { Photo } from "@capacitor/camera";

import { hasPlugin, isNative } from "./platform";

export type CaptureSource = "camera" | "gallery";

/** Max edge length requested from the native camera, in pixels.
 *
 * A modern phone camera produces 12MP+ images of several megabytes. Cloudinary
 * would accept them and then serve a resized variant anyway, so the full-size
 * original costs the rider upload bandwidth on a mobile connection for no
 * visible benefit. 2048 is generous for a photo that will be displayed at
 * 640-1280px.
 */
const MAX_EDGE = 2048;
const QUALITY = 82;

async function nativeCapture(source: CaptureSource): Promise<File | null> {
  // Imported lazily so the plugin's module is not pulled into the web bundle
  // for users who will never reach this path.
  const { Camera, CameraResultType, CameraSource } = await import(
    "@capacitor/camera"
  );

  let photo: Photo;
  try {
    photo = await Camera.getPhoto({
      quality: QUALITY,
      width: MAX_EDGE,
      height: MAX_EDGE,
      // Resize rather than crop: cropping to a square would silently discard
      // the sides of a landscape shot of a road, which is the whole subject.
      correctOrientation: true,
      resultType: CameraResultType.Uri,
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
    });
  } catch (err) {
    // The plugin throws on user cancellation as well as on a real failure.
    // Cancelling is not an error, so it resolves to null and the caller shows
    // nothing.
    const message = err instanceof Error ? err.message.toLowerCase() : "";
    if (message.includes("cancel")) return null;
    throw err;
  }

  if (!photo.webPath) return null;

  // webPath is a local capacitor:// URL the webview can read. Fetching it
  // yields the bytes, which become a File for the existing upload path.
  const res = await fetch(photo.webPath);
  const blob = await res.blob();
  const ext = photo.format || "jpeg";
  return new File([blob], `rydr-${Date.now()}.${ext}`, {
    type: blob.type || `image/${ext}`,
  });
}

function browserPick(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    // `capture` hints at the rear camera on a mobile browser. Ignored on
    // desktop, which is the desired behaviour there.
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // A cancelled picker fires no change event in most browsers, so the
    // promise simply never resolves — acceptable, because the dialog is modal
    // and the user has moved on. Attaching to window focus to detect it is
    // unreliable enough to be worse than the leak.
    input.click();
  });
}

/**
 * Capture or pick an image, natively where available.
 *
 * Returns null when the user cancelled.
 */
export async function capturePhoto(
  source: CaptureSource = "camera"
): Promise<File | null> {
  if (isNative() && hasPlugin("Camera")) {
    return nativeCapture(source);
  }
  return browserPick("image/*");
}

/**
 * Pick a video.
 *
 * The Capacitor Camera plugin is images-only, so video always goes through the
 * file input — which on Android still opens the system picker, including the
 * camcorder. Recording video through a dedicated native plugin was not worth
 * an extra dependency for a path the system picker already covers.
 */
export async function pickVideo(): Promise<File | null> {
  return browserPick("video/*");
}
