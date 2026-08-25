"use client";
/**
 * Share-card preview, download and native share — Phase 4 W4.
 *
 * The backend composes the card as SVG. Download converts it to PNG in a
 * canvas, because SVG is not what a phone gallery or a chat app wants, and
 * the browser is the natural place to rasterise — it already has the fonts
 * and the renderer.
 */
import { useState } from "react";

import { api } from "@/lib/api";

type Props = {
  /** Ride log id for a ride card, or user-badge id for a badge card. */
  id: string;
  kind: "ride" | "badge";
  /** Used for the download filename and the share text. */
  title: string;
};

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

async function svgToPngBlob(svgUrl: string): Promise<Blob> {
  const res = await fetch(svgUrl);
  if (!res.ok) throw new Error(`Card unavailable (${res.status})`);
  const svgText = await res.text();

  // Draw via a blob URL rather than a data: URI. Safari refuses to load a
  // data:image/svg+xml into an <img> for canvas use in some versions, and a
  // blob URL works everywhere.
  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    // The SVG is same-origin-ish via our API, but crossOrigin keeps the
    // canvas untainted so toBlob() is allowed to read it back.
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not render the card"));
      img.src = objectUrl;
    });

    // 2x for a crisp result when the image is viewed on a phone.
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = CARD_WIDTH * scale;
    canvas.height = CARD_HEIGHT * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, CARD_WIDTH, CARD_HEIGHT);

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))),
        "image/png"
      )
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "rydr";
}

export default function ShareCard({ id, kind, title }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const svgUrl =
    kind === "ride" ? api.rideCardUrl(id) : api.badgeCardUrl(id);

  async function download() {
    setBusy(true);
    setError("");
    try {
      const png = await svgToPngBlob(svgUrl);
      const url = URL.createObjectURL(png);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rydr-${slug(title)}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare the image");
    } finally {
      setBusy(false);
    }
  }

  async function nativeShare() {
    setBusy(true);
    setError("");
    try {
      const png = await svgToPngBlob(svgUrl);
      const file = new File([png], `rydr-${slug(title)}.png`, {
        type: "image/png",
      });

      // canShare with the files array is the only reliable test: a browser can
      // implement navigator.share for text and still refuse files, and calling
      // share() blind throws in that case.
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title, text: title });
      } else {
        // No file sharing available — fall back to a download, which is the
        // action the user was reaching for anyway.
        await download();
      }
    } catch (e) {
      // AbortError means the user dismissed the share sheet. That is not a
      // failure and must not surface as an error message.
      if (e instanceof Error && e.name !== "AbortError") {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[13px] font-medium text-charcoal hover:text-ink transition-colors"
      >
        Share
      </button>
    );
  }

  return (
    <div className="bg-surface-card rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Share card</h3>
        <button
          onClick={() => setOpen(false)}
          className="text-[12px] text-charcoal hover:text-ink"
        >
          Close
        </button>
      </div>

      <div className="rounded-lg overflow-hidden border border-hairline bg-surface-deep">
        {/* The card is an SVG served by the API — rendered directly rather
            than rasterised for the preview, which keeps it sharp at any size. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={svgUrl}
          alt={`Share card for ${title}`}
          className="w-full h-auto"
          loading="lazy"
        />
      </div>

      {error && <p className="text-[12px] text-accent-red">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={nativeShare}
          disabled={busy}
          className="bg-ink text-canvas text-[13px] font-medium px-3 py-1.5 rounded-lg disabled:opacity-40"
        >
          {busy ? "Preparing…" : "Share"}
        </button>
        <button
          onClick={download}
          disabled={busy}
          className="border border-hairline-strong text-ink text-[13px] font-medium px-3 py-1.5 rounded-lg disabled:opacity-40"
        >
          Download PNG
        </button>
      </div>
    </div>
  );
}
