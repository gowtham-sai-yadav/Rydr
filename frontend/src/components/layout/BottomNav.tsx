"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    href: "/destinations",
    label: "Discover",
    icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    href: "/rides",
    label: "Rides",
    icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
  },
  {
    href: "/feed",
    label: "Feed",
    icon: "M4 6h16M4 12h16M4 18h7",
  },
  {
    href: "/chat",
    label: "Chat",
    icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  },
  {
    href: "/profile",
    label: "Profile",
    icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-3 left-4 right-4 bg-canvas/80 backdrop-blur-lg border border-hairline-strong rounded-2xl z-50 shadow-2xl select-none">
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-accent-gold/20 to-transparent" />
      <div className="flex justify-around py-2.5 px-1">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-all duration-200 relative ${
                active ? "text-accent-gold scale-[1.05]" : "text-mute hover:text-ink"
              }`}
            >
              <div className={`p-1.5 rounded-full transition-all duration-200 ${
                active ? "bg-accent-gold/10" : ""
              }`}>
                <svg
                  className="w-5.5 h-5.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={active ? 2 : 1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider">{item.label}</span>
              {active && (
                <span className="absolute bottom-0 w-1 h-1 rounded-full bg-accent-gold shadow-[0_0_8px_var(--color-accent-gold)]" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
