"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Navbar from "@/components/layout/Navbar";
import BottomNav from "@/components/layout/BottomNav";
import NativeShell from "@/components/native/NativeShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Spinner,
} from "@/components/ui";

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [showSignout, setShowSignout] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-canvas">
      {/* Native-only behaviour: splash dismissal, status bar, hardware back
          button and push registration. Renders nothing, and every call inside
          is guarded, so it is inert in a browser. */}
      <NativeShell />
      <Navbar onSignout={() => setShowSignout(true)} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28 md:pb-12">
        {children}
      </main>
      <BottomNav />

      <AlertDialog open={showSignout} onOpenChange={setShowSignout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cut the engine?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll need to fire it up again to see your rides, chats
              and notifications.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep riding</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={logout}>
              Cut engine
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
