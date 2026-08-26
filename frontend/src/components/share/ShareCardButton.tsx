"use client";
import { useEffect, useRef, useState } from "react";

type Props = {
  /** Fetches the card image (image/png) from the backend as a Blob. */
  fetchImage: () => Promise<Blob>;
  /** Used as the downloaded filename and the Web Share API title. */
  fileName: string;
  shareTitle?: string;
  shareText?: string;
  label?: string;
  className?: string;
};

/**
 * "Share" trigger that opens a preview modal for a backend-generated PNG
 * card (ride-log or badge share cards). Offers a Download link and, where
 * the Web Share API supports file attachments, a native Share button —
 * falling back to download-only when it doesn't.
 */
export function ShareCardButton({
  fetchImage,
  fileName,
  shareTitle,
  shareText,
  label = "Share",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [objectUrl, setObjectUrl] = useState<string>("");
  const [canShareFile, setCanShareFile] = useState(false);
  const [sharing, setSharing] = useState(false);
  const urlRef = useRef<string>("");

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const openModal = async () => {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const img = await fetchImage();
      const url = URL.createObjectURL(img);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setBlob(img);
      setObjectUrl(url);

      const file = new File([img], `${fileName}.png`, { type: "image/png" });
      setCanShareFile(
        typeof navigator !== "undefined" &&
          typeof navigator.share === "function" &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [file] }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate share card");
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setOpen(false);
    setError("");
  };

  const handleNativeShare = async () => {
    if (!blob) return;
    setSharing(true);
    try {
      const file = new File([blob], `${fileName}.png`, { type: "image/png" });
      await navigator.share({
        files: [file],
        title: shareTitle,
        text: shareText,
      });
    } catch {
      // User cancelled the share sheet, or the browser rejected it — either
      // way there's nothing actionable to show; download stays available.
    } finally {
      setSharing(false);
    }
  };

  return (
    <>
      <button type="button" onClick={openModal} className={`btn btn-ghost ${className ?? ""}`}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
        </svg>
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="card-bordered max-w-sm w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="heading-sm">Share card</h3>
              <button type="button" onClick={closeModal} className="text-mute hover:text-ink">
                ✕
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
              </div>
            ) : error ? (
              <p className="text-accent-red text-sm">{error}</p>
            ) : objectUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={objectUrl} alt="Shareable card" className="w-full rounded-lg" />
                <div className="flex gap-2">
                  <a
                    href={objectUrl}
                    download={`${fileName}.png`}
                    className="btn btn-outline flex-1"
                  >
                    Download
                  </a>
                  {canShareFile && (
                    <button
                      type="button"
                      onClick={handleNativeShare}
                      disabled={sharing}
                      className="btn btn-primary flex-1"
                    >
                      {sharing ? "Sharing…" : "Share"}
                    </button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
