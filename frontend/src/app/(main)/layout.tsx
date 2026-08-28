"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Navbar from "@/components/layout/Navbar";
import BottomNav from "@/components/layout/BottomNav";

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [showSignoutModal, setShowSignoutModal] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-ink/20 border-t-ink" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-canvas">
      <Navbar onSignout={() => setShowSignoutModal(true)} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28 md:pb-12">
        {children}
      </main>
      <BottomNav />

      {showSignoutModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md px-4 select-none animate-fadeIn">
          <div className="relative max-w-md w-full bg-surface-card border border-hairline-strong rounded-2xl overflow-hidden shadow-2xl p-6 text-center space-y-6">
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-accent-gold to-transparent" />
            
            {/* User uploaded scenic route photo */}
            <div 
              className="aspect-video bg-cover bg-center rounded-xl border border-hairline-strong shadow-inner brightness-[0.8]"
              style={{ backgroundImage: "url('/images/desert_ride.png')" }}
            />
            
            <div className="space-y-2">
              <h3 className="text-xl font-bold tracking-tight text-ink uppercase font-display">
                End of the road?
              </h3>
              <p className="text-xs text-mute leading-relaxed font-sans">
                Make sure to return soon. The open road and your riding partners will always be waiting.
              </p>
            </div>
            
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowSignoutModal(false)}
                className="btn btn-outline flex-1 rounded-xl py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200"
              >
                Keep Riding
              </button>
              <button
                onClick={logout}
                className="btn btn-primary bg-gradient-to-r from-accent-red to-accent-orange text-ink flex-1 rounded-xl py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 border-none shadow-[0_4px_14px_rgba(239,68,68,0.25)] hover:shadow-[0_4px_20px_rgba(239,68,68,0.45)]"
              >
                Shut Down Engine
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ProtectedLayout>{children}</ProtectedLayout>
    </AuthProvider>
  );
}
