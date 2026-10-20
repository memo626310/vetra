"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { vetraCore } from "@/lib/vetra-core";

export default function LoginPage() {
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const enteredIdentifier = identifier.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enteredIdentifier);
    const digits = enteredIdentifier.replace(/\D/g, "");
    let normalizedPhone = "";
    if (!isEmail) {
      if (!/^[+\d\s().-]+$/.test(enteredIdentifier)) {
        setError("Enter a valid email address or phone number.");
        setLoading(false);
        return;
      }
      if (enteredIdentifier.startsWith("+")) normalizedPhone = `+${digits}`;
      else if (digits.startsWith("00")) normalizedPhone = `+${digits.slice(2)}`;
      else if (digits.startsWith("0")) normalizedPhone = `+20${digits.slice(1)}`;
      else if (digits.startsWith("20")) normalizedPhone = `+${digits}`;
      else normalizedPhone = `+20${digits}`;
      if (digits.length < 8 || digits.length > 15) {
        setError("Enter a valid email address or phone number.");
        setLoading(false);
        return;
      }
    }
    const normalizedEmail = enteredIdentifier.toLowerCase();
    const credentials = isEmail
      ? { email: normalizedEmail, password }
      : { phone: normalizedPhone, password };

    const { error: coreError } = await vetraCore.auth.signInWithPassword(credentials);
    if (coreError) {
      const phoneLoginDisabled = !isEmail && /phone.*disabled|phone.*not enabled|phone provider/i.test(coreError.message);
      setError(phoneLoginDisabled
        ? "Phone login is not enabled in VETRA CORE Auth settings."
        : "Invalid email/phone or password.");
      setLoading(false);
      return;
    }

    const legacyCredentials = isEmail
      ? { email: normalizedEmail, password }
      : { phone: normalizedPhone, password };
    const { error: clinicError } = await supabase.auth.signInWithPassword(legacyCredentials);
    if (clinicError) console.info("Legacy clinic session unavailable; continuing with Core clinic access.");

    const { data: clinicData, error: clinicContextError } = await vetraCore.rpc("get_my_clinic_context");
    if (clinicContextError) {
      console.error("VETRA CORE CLINIC CONTEXT ERROR:", clinicContextError);
      await Promise.all([vetraCore.auth.signOut(), supabase.auth.signOut()]);
      setError("We could not verify your clinic. Please try again.");
      setLoading(false);
      return;
    }

    const clinicContext = Array.isArray(clinicData) ? clinicData[0] ?? null : null;
    console.log("LOGIN CLINIC CHECK:", clinicContext);

    if (!clinicContext || !clinicContext.clinic_id || clinicContext.clinic_status !== "active" || clinicContext.member_status !== "active") {
      router.replace("/clinic-setup");
      router.refresh();
      return;
    }

    const { data: sessionData } = await vetraCore.auth.getSession();
    const staffStateResponse = await fetch("/api/staff/auth-state", {
      headers: { Authorization: `Bearer ${sessionData.session?.access_token || ""}` },
      cache: "no-store",
    });
    const staffState = await staffStateResponse.json().catch(() => null) as { mustChangePassword?: boolean } | null;
    if (!staffStateResponse.ok || !staffState) {
      await Promise.all([vetraCore.auth.signOut(), supabase.auth.signOut()]);
      setError("We could not verify your account security status. Please try again.");
      setLoading(false);
      return;
    }

    router.replace(staffState.mustChangePassword ? "/change-password" : "/dashboard");
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
                Email or phone number
              </label>

              <input
                type="text"
                value={identifier}
                onChange={(e) =>
                  setIdentifier(e.target.value)
                }
                placeholder="doctor@vetra.top or 01012345678"
                autoComplete="username"
                inputMode="text"
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
