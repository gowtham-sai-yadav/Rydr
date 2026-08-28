"use client";
import { AuthProvider } from "@/context/AuthContext";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="min-h-screen flex items-center justify-center bg-canvas px-4 relative overflow-hidden">
        {/* Cinematic full-screen background photo */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-[1.02] filter brightness-[0.4]"
          style={{ backgroundImage: `url('/images/ai_rider_bg.png')` }}
        />
        
        {/* Dark radial glow layer */}
        <div className="absolute inset-0 bg-gradient-to-tr from-canvas via-canvas/90 to-transparent pointer-events-none" />
        
        {/* Cyber lighting overlay */}
        <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] rounded-full bg-accent-gold/5 blur-[140px] pointer-events-none animate-pulse" />
        <div className="absolute bottom-1/4 right-1/3 w-[500px] h-[500px] rounded-full bg-accent-blue/5 blur-[140px] pointer-events-none" />

        {/* Tactical grid alignment overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.003)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.003)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

        <div className="relative z-10 w-full flex justify-center">
          {children}
        </div>
      </div>
    </AuthProvider>
  );
}
