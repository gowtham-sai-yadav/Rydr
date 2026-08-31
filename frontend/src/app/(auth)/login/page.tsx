"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Button, Input, Alert } from "@/components/ui";

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
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md px-2">
      <div className="text-center mb-8">
        <h1 className="font-display text-5xl font-black tracking-tighter text-accent-gold select-none">
          Rydr
        </h1>
        <p className="mt-3 text-mute text-sm">Where riders find their next road.</p>
      </div>

      <div className="rounded-[var(--radius-card)] bg-surface-card border border-hairline-strong backdrop-blur-xl p-6 sm:p-8 shadow-2xl relative">
        <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-gold/40 to-transparent" />
        <h2 className="font-display text-lg font-semibold text-ink mb-5">
          Welcome back
        </h2>

        {error && (
          <div className="mb-4">
            <Alert variant="destructive">{error}</Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-mute"
            >
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-mute"
            >
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="text-center text-mute mt-6 text-xs">
          New here?{" "}
          <Link
            href="/signup"
            className="text-accent-gold font-semibold hover:underline underline-offset-4"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
