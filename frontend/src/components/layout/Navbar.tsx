"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import NotificationBell from "@/components/notifications/NotificationBell";

const navItems = [
  { href: "/destinations", label: "Discover" },
  { href: "/feed", label: "Feed" },
  { href: "/rides", label: "Rides" },
  { href: "/chat", label: "Chat" },
  { href: "/profile", label: "Profile" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

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
            {/* Moderation is appended for admins only. Non-admins get a 403
                from the API, so showing the link would be a dead end. */}
            {(user?.is_admin
              ? [...navItems, { href: "/admin/reports", label: "Moderation" }]
              : navItems
            ).map((item) => {
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
          </nav>

          <div className="flex items-center gap-3">
            {user && <NotificationBell />}
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
