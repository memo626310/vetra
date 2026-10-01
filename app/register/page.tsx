"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { vetraCore } from "@/lib/vetra-core";

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();

    setError("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (!normalizedEmail) {
      setError("Please enter your email.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    // ==========================================
    // VETRA CORE ONLY
    // ==========================================

    const { data, error: signupError } =
      await vetraCore.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim() || null,
          },
        },
      });

    if (signupError) {
      // Useful when testing an account that already exists.
      if (
        /already registered|already exists/i.test(
          signupError.message
        )
      ) {
        const { error: loginError } =
          await vetraCore.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });

        if (!loginError) {
          router.replace("/clinic-setup");
          router.refresh();
          return;
        }
      }

      setError(signupError.message);
      setLoading(false);
      return;
    }

    if (!data.user) {
      setError("VETRA Core account could not be created.");
      setLoading(false);
      return;
    }

    // Confirm Email is already disabled in Core,
    // so this should normally give us a session.
    if (data.session) {
      router.replace("/clinic-setup");
      router.refresh();
      return;
    }

    setError(
      "Account created, but no active session was returned."
    );

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto flex min-h-[85vh] max-w-md items-center justify-center">
        <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">

          {/* Header */}

          <div className="mb-8 text-center">
            <div className="mb-4 text-5xl">
              🐾
            </div>

            <h1 className="text-3xl font-black tracking-tight">
              Create your VETRA account
            </h1>

            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Your doctor account for managing your clinics
            </p>
          </div>

          <form
            onSubmit={handleRegister}
            className="space-y-5"
          >

            {/* Full Name */}

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Full Name
              </label>

              <input
                type="text"
                value={fullName}
                onChange={(e) =>
                  setFullName(e.target.value)
                }
                placeholder="Dr. Mohamed"
                autoComplete="name"
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-slate-500 dark:focus:ring-slate-700"
              />
            </div>

            {/* Phone */}

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Phone
              </label>

              <input
                type="tel"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value)
                }
                placeholder="01xxxxxxxxx"
                autoComplete="tel"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-slate-500 dark:focus:ring-slate-700"
              />
            </div>

            {/* Email */}

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Email
              </label>

              <input
                type="email"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                placeholder="doctor@example.com"
                autoComplete="email"
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-slate-500 dark:focus:ring-slate-700"
              />
            </div>

            {/* Password */}

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Password
              </label>

              <input
                type="password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                placeholder="••••••••"
                autoComplete="new-password"
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-slate-500 dark:focus:ring-slate-700"
              />
            </div>

            {/* Confirm Password */}

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Confirm Password
              </label>

              <input
                type="password"
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(e.target.value)
                }
                placeholder="••••••••"
                autoComplete="new-password"
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-slate-500 dark:focus:ring-slate-700"
              />
            </div>

            {/* Error */}

            {error && (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Submit */}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-slate-900 px-5 py-3.5 font-bold text-white transition hover:scale-[1.01] hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {loading
                ? "Creating your account..."
                : "Create VETRA Account"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Already have an account?{" "}

            <Link
              href="/login"
              className="font-bold text-slate-900 underline underline-offset-4 dark:text-white"
            >
              Login
            </Link>
          </div>

        </div>
      </div>
    </main>
  );
}