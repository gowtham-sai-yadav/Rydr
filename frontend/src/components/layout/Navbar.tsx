"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { NotificationBell } from "@/components/notifications/NotificationBell";

const navItems = [
  { href: "/destinations", label: "Discover" },
  { href: "/rides", label: "Rides" },
  { href: "/feed", label: "Feed" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/chat", label: "Chat" },
  { href: "/profile", label: "Profile" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const isAdmin = user?.is_admin === true;

  return (
    <header className="sticky top-0 z-50 bg-canvas/95 backdrop-blur-sm border-b border-hairline">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link
            href="/destinations"
            className="font-display text-2xl font-light tracking-tight text-ink"
          >
            Rydr
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-surface-elevated text-ink"
                      : "text-charcoal hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                href="/admin/reports"
                className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                  pathname.startsWith("/admin")
                    ? "bg-surface-elevated text-ink"
                    : "text-charcoal hover:text-ink"
                }`}
              >
                Admin
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-3">
            <NotificationBell />
            <span className="text-[13px] text-charcoal hidden sm:block">
              {user?.name}
            </span>
            <button
              onClick={logout}
              className="text-[13px] text-charcoal hover:text-ink transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
