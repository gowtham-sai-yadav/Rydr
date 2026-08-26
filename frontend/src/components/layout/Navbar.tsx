"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import NotificationBell from "@/components/notifications/NotificationBell";

const navItems = [
  { href: "/destinations", label: "Discover" },
  { href: "/feed", label: "Feed" },
  { href: "/rides", label: "Rides" },
  { href: "/clubs", label: "Clubs" },
  { href: "/events", label: "Events" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/chat", label: "Chat" },
  { href: "/profile", label: "Profile" },
];

export default function Navbar({ onSignout }: { onSignout?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const isAdmin = user?.is_admin === true;

  return (
    <header className="sticky top-0 z-50 bg-canvas/80 backdrop-blur-md border-b border-hairline-strong shadow-lg">
      <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-accent-gold via-accent-orange to-accent-blue" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link
            href="/destinations"
            className="font-display text-2xl font-black tracking-tighter bg-gradient-to-r from-accent-gold to-accent-orange bg-clip-text text-transparent hover:scale-[1.02] transition-transform select-none"
          >
            Rydr
          </Link>

          <nav className="hidden md:flex items-center gap-2">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider relative ${
                    active
                      ? "bg-gradient-to-r from-accent-gold/25 to-accent-orange/15 border border-accent-gold/40 text-accent-gold"
                      : "text-mute hover:text-ink hover:bg-surface-elevated/40"
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute bottom-0 inset-x-4 h-[2px] bg-accent-gold rounded-full shadow-[0_0_8px_var(--color-accent-gold)] flex items-center justify-center">
                      <span className="absolute -top-3 w-4 h-4 text-accent-gold transform scale-95 flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-accent-gold"><path d="M19 15c0-1.7-1.3-3-3-3s-3 1.3-3 3 1.3 3 3 3 3-1.3 3-3zm-14 0c0-1.7-1.3-3-3-3s-3 1.3-3 3 1.3 3 3 3 3-1.3 3-3zm13.5-6h-3.8c-.4-1.2-1.5-2-2.7-2H7.5C6.1 7 5 8.1 5 9.5V11H3.5c-.8 0-1.5.7-1.5 1.5S2.7 14 3.5 14H5c.4 1.2 1.5 2 2.7 2H10c.8 0 1.5-.7 1.5-1.5S10.8 13 10 13H8.3c-.4-.7-.4-1.6 0-2.3C8.8 10 9.8 9.5 11 9.5h3.6c1.1 0 2 .9 2 2v2.5h-1c-.8 0-1.5.7-1.5 1.5s.7 1.5 1.5 1.5H19c2.8 0 5-2.2 5-5s-2.2-5-5-5z" /></svg>
                      </span>
                    </span>
                  )}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                href="/admin/reports"
                className={`px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider relative ${
                  pathname.startsWith("/admin")
                    ? "bg-gradient-to-r from-accent-red/25 to-accent-orange/15 border border-accent-red/40 text-accent-red"
                    : "text-mute hover:text-ink hover:bg-surface-elevated/40"
                }`}
              >
                Admin
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-4">
            {user && <NotificationBell />}
            {user && (
              <div className="flex items-center gap-2 bg-surface-elevated/40 px-3 py-1.5 rounded-full border border-hairline-strong">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
                <span className="text-xs font-semibold text-body select-none">
                  {user.name}
                </span>
              </div>
            )}
            <button
              onClick={onSignout}
              className="text-xs font-semibold uppercase tracking-wider text-mute hover:text-accent-red border border-hairline hover:border-accent-red/20 px-3 py-1.5 rounded-full transition-all duration-200"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
