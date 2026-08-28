"use client";
/**
 * Native shell behaviours — Phase 4 W9/W10.
 *
 * Mounted once inside the authenticated layout. Everything it does is a no-op
 * in a browser, so the same tree renders on both platforms.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { routes } from "@/lib/routes";
import { isNative } from "@/lib/native/platform";
import { initPush } from "@/lib/native/push";

export default function NativeShell() {
  const router = useRouter();

  useEffect(() => {
    if (!isNative()) return;
    const disposers: Array<() => void> = [];

    (async () => {
      const [{ SplashScreen }, { StatusBar, Style }, { App }] = await Promise.all([
        import("@capacitor/splash-screen"),
        import("@capacitor/status-bar"),
        import("@capacitor/app"),
      ]);

      // Hidden here rather than on a timer: the app is interactive once React
      // has mounted, and a fixed duration is either a stall on a fast device
      // or a white flash on a slow one.
      await SplashScreen.hide().catch(() => {});

      // The app is a dark theme, so the status bar needs light content or its
      // icons vanish into the black header.
      await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      await StatusBar.setBackgroundColor({ color: "#000000" }).catch(() => {});

      // Android's hardware back button does nothing by default in a webview,
      // which makes an app feel broken. Wire it to history, and let it exit
      // only from a top-level screen.
      const backHandle = await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) router.back();
        else void App.exitApp();
      });
      disposers.push(() => void backHandle.remove());

      await initPush({
        onTap: (data) => {
          // The server payload names where to go. Falls back to the feed
          // rather than doing nothing, so a tap always lands somewhere.
          const entity = String(data.entity_type ?? "");
          const id = String(data.entity_id ?? "");
          if (!id) return router.push(routes.feed);
          if (entity === "ride") return router.push(routes.ride(id));
          if (entity === "chat_group") return router.push(routes.chatRoom(id));
          if (entity === "destination") return router.push(routes.destination(id));
          if (entity === "user") return router.push(routes.user(id));
          return router.push(routes.feed);
        },
      });
    })();

    return () => {
      disposers.forEach((d) => d());
    };
  }, [router]);

  return null;
}
