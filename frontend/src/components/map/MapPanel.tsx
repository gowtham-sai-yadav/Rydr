"use client";
/**
 * SSR boundary for the Leaflet map — Phase 4 W2.
 *
 * Leaflet reads `window` when its module body runs, so it cannot be imported
 * into anything Next renders on the server. This wrapper is the single place
 * that boundary is declared, so no page has to remember it.
 */
import dynamic from "next/dynamic";

import type { DestinationPin } from "@/lib/api.types";

const DestinationMap = dynamic(() => import("./DestinationMap"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-[420px] sm:h-[520px] rounded-lg border border-hairline bg-surface-card flex items-center justify-center"
      role="status"
    >
      <span className="text-[13px] text-mute">Loading map…</span>
    </div>
  ),
});

type Props = {
  origin?: [number, number] | null;
  onSelect?: (pin: DestinationPin) => void;
  className?: string;
};

export default function MapPanel(props: Props) {
  return <DestinationMap {...props} />;
}
