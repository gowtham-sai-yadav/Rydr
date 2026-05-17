"use client";
import { AuthProvider } from "@/context/AuthContext";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="min-h-screen flex items-center justify-center bg-canvas px-4 glow-orange">
        {children}
      </div>
    </AuthProvider>
  );
}
