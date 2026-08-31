"use client";
/**
 * Root route.
 *
 * Previously this redirected to /login unconditionally, so a rider who opened
 * the bare domain with a valid session was bounced to the sign-in form anyway.
 *
 * It cannot read AuthContext: the provider is mounted in the (main) layout and
 * this page sits outside it. So it checks for a stored token and lets the
 * protected layout do the real validation. A token that turns out to be expired
 * lands on /destinations and is redirected to /login from there, which is the
 * same outcome as before for the case that actually deserves it.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { TOKEN_KEY } from "@/lib/constants";
import { routes } from "@/lib/routes";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let signedIn = false;
    try {
      signedIn = !!localStorage.getItem(TOKEN_KEY);
    } catch {
      // Private-mode browsers can throw on localStorage access. Treat that as
      // signed out rather than failing to route anywhere at all.
      signedIn = false;
    }
    router.replace(signedIn ? routes.destinations : "/login");
  }, [router]);

  // Renders nothing: this route only decides where to send the visitor, and a
  // spinner would flash on every visit for the few milliseconds it takes.
  return null;
}
