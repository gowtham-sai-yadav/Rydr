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
    <div className="w-full max-w-md">
      <div className="text-center mb-10">
        <h1 className="display-xl mb-3">Rydr</h1>
        <p className="text-charcoal body-md">Sign up to start planning rides.</p>
      </div>

      <div className="card-bordered p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className={`h-0.5 flex-1 rounded ${step >= 1 ? "bg-ink" : "bg-hairline-strong"}`} />
          <div className={`h-0.5 flex-1 rounded ${step >= 2 ? "bg-ink" : "bg-hairline-strong"}`} />
        </div>

        <h2 className="heading-md text-ink mb-6">
          {step === 1 ? "Your details" : "Your bike"}
        </h2>

        {error && (
          <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-md mb-4 text-sm">
            {error}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleNext} className="space-y-4">
            <div>
              <label className="label-eyebrow block mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="input"
                placeholder="Your full name"
              />
            </div>
            <div>
              <label className="label-eyebrow block mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="label-eyebrow block mb-2">Phone (optional)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input"
                placeholder="+91 98765 43210"
              />
            </div>
            <div>
              <label className="label-eyebrow block mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="input"
                placeholder="Min 8 characters"
              />
            </div>
            <button type="submit" className="btn btn-primary w-full h-11">
              Continue
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-eyebrow block mb-2">Bike name</label>
              <input
                type="text"
                value={bikeName}
                onChange={(e) => setBikeName(e.target.value)}
                className="input"
                placeholder='"Shadow"'
              />
            </div>
            <div>
              <label className="label-eyebrow block mb-2">Model</label>
              <input
                type="text"
                value={bikeModel}
                onChange={(e) => setBikeModel(e.target.value)}
                className="input"
                placeholder="Honda CB650R"
              />
            </div>
            <div>
              <label className="label-eyebrow block mb-2">Year</label>
              <input
                type="number"
                value={bikeYear}
                onChange={(e) => setBikeYear(e.target.value)}
                className="input"
                placeholder="2024"
              />
            </div>
            <p className="caption">
              You can add mileage and home location on your profile after sign-up — they power cost estimates.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn btn-outline flex-1 h-11"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary flex-1 h-11"
              >
                {loading ? "Creating…" : "Create account"}
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-charcoal mt-6 text-sm">
          Already have an account?{" "}
          <Link href="/login" className="link font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
