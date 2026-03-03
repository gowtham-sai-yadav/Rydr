"use client";
import { AuthProvider } from "@/context/AuthContext";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
        {children}
      </div>
    </AuthProvider>
  );
}
