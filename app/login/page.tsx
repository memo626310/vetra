"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { vetraCore } from "@/lib/vetra-core";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setError("");

    const normalizedEmail = email.trim().toLowerCase();

    // ==========================================
    // 1. Authenticate through VETRA Core
    // ==========================================

    const { error: coreError } =
      await vetraCore.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

    if (coreError) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }

    // ==========================================
    // 2. Keep the existing clinic session alive
    //    during the Core migration
    // ==========================================

    const { error: clinicError } =
      await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

    if (clinicError) {
      // Do not leave the Core session active
      // if the clinic session could not be created.
      await vetraCore.auth.signOut();

      setError(
        "Your VETRA Core account is valid, but clinic access is not linked yet."
      );

      setLoading(false);
      return;
    }

    // ==========================================
    // 3. Check clinic BEFORE entering Dashboard
    // ==========================================

    const {
      data: clinicData,
      error: clinicContextError,
    } = await vetraCore.rpc(
      "get_my_clinic_context"
    );

    if (clinicContextError) {
      console.error(
        "VETRA CORE CLINIC CONTEXT ERROR:",
        clinicContextError
      );

      await Promise.all([
        vetraCore.auth.signOut(),
        supabase.auth.signOut(),
      ]);

      setError(
        "We could not verify your clinic. Please try again."
      );

      setLoading(false);
      return;
    }

    const clinicContext = Array.isArray(clinicData)
      ? clinicData[0] ?? null
      : null;

    console.log(
      "LOGIN CLINIC CHECK:",
      clinicContext
    );

    // ==========================================
    // 4. No active clinic → Clinic Setup
    // ==========================================

    if (
      !clinicContext ||
      !clinicContext.clinic_id ||
      clinicContext.clinic_status !== "active" ||
      clinicContext.member_status !== "active"
    ) {
      router.replace("/clinic-setup");
      router.refresh();
      return;
    }

    // ==========================================
    // 5. Active clinic → Dashboard
    // ==========================================

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto flex min-h-[85vh] max-w-md items-center justify-center">
        <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">

          {/* Logo / Header */}

          <div className="mb-8 text-center">
            <div className="mb-4 text-4xl">
              🐾
            </div>

            <h1 className="text-3xl font-bold tracking-tight">
              VETRA
            </h1>

            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Veterinary Clinic Management
            </p>
          </div>

          {/* Login Form */}

          <form
            onSubmit={handleLogin}
            className="space-y-5"
          >

            {/* Email */}

            <div>
              <label className="mb-2 block text-sm font-medium">
                Email
              </label>

              <input
                type="email"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                placeholder="doctor@vetra.top"
                autoComplete="email"
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-slate-500 dark:focus:ring-slate-700"
              />
            </div>

            {/* Password */}

            <div>
              <label className="mb-2 block text-sm font-medium">
                Password
              </label>

              <input
                type="password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                placeholder="••••••••"
                autoComplete="current-password"
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
              className="w-full rounded-2xl bg-slate-900 px-5 py-3.5 font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {loading
                ? "Signing in..."
                : "Sign in"}
            </button>

          </form>

          {/* Footer */}

          <p className="mt-8 text-center text-xs text-slate-400">
            VETRA Veterinary Management System
          </p>

        </div>
      </div>
    </main>
  );
}