"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md px-2">
      <div className="text-center mb-8">
        <h1 className="display-xl mb-3 bg-gradient-to-r from-accent-gold via-accent-orange to-accent-blue bg-clip-text text-transparent font-extrabold tracking-tighter drop-shadow-md select-none">
          Rydr
        </h1>
        <p className="text-mute body-sm font-medium tracking-wide uppercase select-none opacity-80">
          Scouted Trails. Logged Journeys. Ride Joined.
        </p>
      </div>

      <div className="card-bordered p-8 bg-surface-card/40 backdrop-blur-xl border border-hairline-strong shadow-2xl relative">
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-accent-gold/40 to-transparent" />
        <h2 className="heading-sm text-ink mb-6 font-semibold select-none">
          Welcome back
        </h2>

        {error && (
          <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-md mb-4 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="label-eyebrow block mb-2 font-semibold">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input bg-surface-deep/60 border border-hairline-strong focus:border-accent-gold px-4 py-3 text-ink text-sm rounded-lg w-full transition-all duration-200"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="label-eyebrow block mb-2 font-semibold">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="input bg-surface-deep/60 border border-hairline-strong focus:border-accent-gold px-4 py-3 text-ink text-sm rounded-lg w-full transition-all duration-200"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full h-11 rounded-lg text-sm font-semibold tracking-wider uppercase transition-all duration-200"
          >
            {loading ? "Igniting Engine…" : "Start Engine (Sign in)"}
          </button>
        </form>

        <p className="text-center text-mute mt-6 text-xs">
          New here?{" "}
          <Link href="/signup" className="text-accent-gold hover:underline font-semibold ml-1">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
