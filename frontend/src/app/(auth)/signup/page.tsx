"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function SignupPage() {
  const { signup } = useAuth();
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Step 1: User info
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // Step 2: Bike info
  const [bikeName, setBikeName] = useState("");
  const [bikeModel, setBikeModel] = useState("");
  const [bikeYear, setBikeYear] = useState("");

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signup({
        name,
        email,
        phone: phone || null,
        password,
        bike_name: bikeName || null,
        bike_model: bikeModel || null,
        bike_year: bikeYear ? parseInt(bikeYear) : null,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signup failed");
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
          Create an account to start planning rides.
        </p>
      </div>

      <div className="card-bordered p-8 bg-surface-card/40 backdrop-blur-xl border border-hairline-strong shadow-2xl relative">
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-accent-gold/40 to-transparent" />
        
        <div className="flex items-center gap-2 mb-6 select-none">
          <div className={`h-[3px] flex-1 rounded transition-all duration-300 ${step >= 1 ? "bg-accent-gold" : "bg-hairline-strong"}`} />
          <div className={`h-[3px] flex-1 rounded transition-all duration-300 ${step >= 2 ? "bg-accent-gold" : "bg-hairline-strong"}`} />
        </div>

        <h2 className="heading-sm text-ink mb-6 font-semibold select-none">
          {step === 1 ? "Your details" : "Your bike"}
        </h2>

        {error && (
          <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-md mb-4 text-xs">
            {error}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleNext} className="space-y-4">
            <div>
              <label className="label-eyebrow block mb-2 font-semibold">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="input bg-surface-deep/60 border border-hairline-strong focus:border-accent-gold px-4 py-2.5 text-ink text-sm rounded-lg w-full transition-all duration-200"
                placeholder="Your full name"
              />
            </div>
            <div>
              <label className="label-eyebrow block mb-2 font-semibold">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input bg-surface-deep/60 border border-hairline-strong focus:border-accent-gold px-4 py-2.5 text-ink text-sm rounded-lg w-full transition-all duration-200"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="label-eyebrow block mb-2 font-semibold">Phone (optional)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input bg-surface-deep/60 border border-hairline-strong focus:border-accent-gold px-4 py-2.5 text-ink text-sm rounded-lg w-full transition-all duration-200"
                placeholder="+91 98765 43210"
              />
            </div>
            <div>
              <label className="label-eyebrow block mb-2 font-semibold">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="input bg-surface-deep/60 border border-hairline-strong focus:border-accent-gold px-4 py-2.5 text-ink text-sm rounded-lg w-full transition-all duration-200"
                placeholder="Min 8 characters"
              />
            </div>
            <button type="submit" className="btn btn-primary w-full h-11 rounded-lg text-sm font-semibold tracking-wider uppercase transition-all duration-200">
              Continue
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-eyebrow block mb-2 font-semibold">Bike name</label>
              <input
                type="text"
                value={bikeName}
                onChange={(e) => setBikeName(e.target.value)}
                className="input bg-surface-deep/60 border border-hairline-strong focus:border-accent-gold px-4 py-2.5 text-ink text-sm rounded-lg w-full transition-all duration-200"
                placeholder="e.g. Shadow"
              />
            </div>
            <div>
              <label className="label-eyebrow block mb-2 font-semibold">Model</label>
              <input
                type="text"
                value={bikeModel}
                onChange={(e) => setBikeModel(e.target.value)}
                className="input bg-surface-deep/60 border border-hairline-strong focus:border-accent-gold px-4 py-2.5 text-ink text-sm rounded-lg w-full transition-all duration-200"
                placeholder="Honda CB650R"
              />
            </div>
            <div>
              <label className="label-eyebrow block mb-2 font-semibold">Year</label>
              <input
                type="number"
                value={bikeYear}
                onChange={(e) => setBikeYear(e.target.value)}
                className="input bg-surface-deep/60 border border-hairline-strong focus:border-accent-gold px-4 py-2.5 text-ink text-sm rounded-lg w-full transition-all duration-200"
                placeholder="2024"
              />
            </div>
            <p className="caption select-none">
              You can add mileage and home location on your profile after sign-up — they power cost estimates.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn btn-outline flex-1 h-11 rounded-lg text-sm font-semibold tracking-wider uppercase transition-all duration-200"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary flex-1 h-11 rounded-lg text-sm font-semibold tracking-wider uppercase transition-all duration-200"
              >
                {loading ? "Creating…" : "Create account"}
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-mute mt-6 text-xs select-none">
          Already have an account?{" "}
          <Link href="/login" className="text-accent-gold hover:underline font-semibold ml-1">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
