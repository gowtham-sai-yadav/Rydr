"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Newspaper, Route, Trophy, MessageSquare, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
}

// Six items only — the mobile strip is narrow. Order matches the top nav's
// information-flow: Discover → Feed → Rides → Leaderboard → Chat → Profile.
// (Fixed the pre-existing bug where /feed appeared twice.)
const navItems: NavItem[] = [
  { href: "/destinations", label: "Discover", Icon: Compass },
  { href: "/feed", label: "Feed", Icon: Newspaper },
  { href: "/rides", label: "Rides", Icon: Route },
  { href: "/leaderboard", label: "Board", Icon: Trophy },
  { href: "/chat", label: "Chat", Icon: MessageSquare },
  { href: "/profile", label: "Profile", Icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "md:hidden fixed bottom-3 left-4 right-4 z-50",
        "bg-canvas/80 backdrop-blur-lg border border-hairline-strong rounded-2xl shadow-2xl",
        "select-none",
      )}
      aria-label="Primary"
    >
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-accent-gold/20 to-transparent" />
      <ul className="flex justify-around py-2 px-1">
        {navItems.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1 transition-colors duration-[120ms]",
                  active
                    ? "text-accent-gold"
                    : "text-mute hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center h-8 w-8 rounded-full transition-colors duration-[120ms]",
                    active ? "bg-accent-gold/10" : "",
                  )}
                >
                  <Icon
                    className={cn("h-5 w-5", active && "stroke-[2.2]")}
                    aria-hidden
                  />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider">
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
