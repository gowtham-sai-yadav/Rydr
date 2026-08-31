"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import NotificationBell from "@/components/notifications/NotificationBell";
import Avatar from "@/components/ui/Avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";
import { cn } from "@/lib/cn";

const navItems = [
  { href: "/destinations", label: "Discover" },
  { href: "/feed", label: "Feed" },
  { href: "/rides", label: "Rides" },
  { href: "/clubs", label: "Clubs" },
  { href: "/events", label: "Events" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/chat", label: "Chat" },
];

export default function Navbar({ onSignout }: { onSignout?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdmin = user?.is_admin === true;

  return (
    <header className="sticky top-0 z-40 bg-canvas/85 backdrop-blur-md border-b border-hairline-strong">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          <Link
            href="/destinations"
            className="font-display text-2xl font-black tracking-tighter text-accent-gold hover:text-accent-gold-strong transition-colors select-none"
          >
            Rydr
          </Link>

          <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative px-3 py-1.5 rounded-[var(--radius-button)]",
                    "text-xs font-semibold uppercase tracking-wider",
                    "transition-colors duration-[120ms]",
                    active
                      ? "text-accent-gold"
                      : "text-mute hover:text-ink hover:bg-white/[0.03]",
                  )}
                >
                  {item.label}
                  {active && (
                    <span className="absolute -bottom-[9px] left-3 right-3 h-[2px] rounded-full bg-accent-gold shadow-[0_0_10px_var(--color-accent-gold-glow)]" />
                  )}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                href="/admin/reports"
                aria-current={pathname.startsWith("/admin") ? "page" : undefined}
                className={cn(
                  "relative px-3 py-1.5 rounded-[var(--radius-button)]",
                  "text-xs font-semibold uppercase tracking-wider",
                  "transition-colors duration-[120ms] flex items-center gap-1.5",
                  pathname.startsWith("/admin")
                    ? "text-accent-red"
                    : "text-mute hover:text-ink hover:bg-white/[0.03]",
                )}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2">
            {user && <NotificationBell />}
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 border border-hairline-strong bg-surface-elevated/60 hover:border-accent-gold/40 hover:bg-surface-elevated transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-gold/60"
                    aria-label="Account menu"
                  >
                    <Avatar
                      name={user.name}
                      avatarUrl={user.avatar_url}
                      size="xs"
                    />
                    <span className="text-xs font-semibold text-body max-w-[8rem] truncate">
                      {user.name}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[12rem]">
                  <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
                  <div className="px-3 pb-2 -mt-1 text-xs text-mute truncate">
                    {user.email}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile">Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/rides">My rides</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={onSignout}>
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
