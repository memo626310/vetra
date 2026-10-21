"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { vetraCore } from "@/lib/vetra-core";
import { clientPortalPhotos } from "../client-interface/pet-photos";

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
    <main className="flex min-h-screen items-center justify-center bg-[#15111b] px-4 py-6 text-white sm:px-8 sm:py-10">
      <div className="grid w-full max-w-[1336px] overflow-hidden rounded-[32px] border border-white/15 bg-[#dedde0] shadow-[0_30px_100px_rgba(0,0,0,0.35)] sm:rounded-[42px] lg:min-h-[min(780px,calc(100vh-80px))] lg:grid-cols-2">
        <section className="relative flex min-h-[270px] items-end overflow-hidden bg-[#101923] px-7 py-8 sm:min-h-[330px] sm:px-10 sm:py-10 lg:min-h-0 lg:items-center lg:px-12 lg:py-14">
          <Image
            src={clientPortalPhotos[0].src}
            alt={clientPortalPhotos[0].alt}
            fill
            unoptimized
            priority
            sizes="(max-width: 1023px) 100vw, 50vw"
            className="object-cover object-center"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#101923]/95 via-[#101923]/35 to-[#101923]/10" />
          <div className="relative z-10 mx-auto max-w-md text-center">
            <h1 className="text-3xl font-black sm:text-4xl lg:text-[44px]">
              Welcome back
            </h1>
            <p className="mt-3 text-sm leading-7 text-white/90 sm:text-base">
              Veterinary care, organized in one place.
            </p>
          </div>
        </section>

        <section className="flex items-center bg-[#dedde0] px-7 py-9 text-[#201a28] sm:px-12 sm:py-12 lg:px-[64px] lg:py-14">
          <div className="mx-auto w-full max-w-[540px]">
            <div className="mb-8 sm:mb-10">
              <h2 className="text-4xl font-black leading-tight sm:text-[46px]">
                Sign in
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#6b6472] sm:text-base">
                Access your VETRA clinic workspace.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5 sm:space-y-6">
              <label className="block">
                <span className="mb-2.5 block text-sm font-bold sm:text-base">
                  Email or phone number
                </span>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="doctor@vetra.top or 01012345678"
                  autoComplete="username"
                  inputMode="text"
                  required
                  className="h-[62px] w-full rounded-[18px] border border-[#33283f] bg-[#211a2a] px-5 text-base text-white outline-none transition placeholder:text-[#aaa2b4] focus:border-[#76668d] focus:ring-4 focus:ring-[#211a2a]/10 sm:h-[74px] sm:px-6 sm:text-lg"
                />
              </label>

              <label className="block">
                <span className="mb-2.5 block text-sm font-bold sm:text-base">
                  Password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  className="h-[62px] w-full rounded-[18px] border border-[#33283f] bg-[#211a2a] px-5 text-base text-white outline-none transition placeholder:text-[#aaa2b4] focus:border-[#76668d] focus:ring-4 focus:ring-[#211a2a]/10 sm:h-[74px] sm:px-6 sm:text-lg"
                />
              </label>

              {error && (
                <div role="alert" className="rounded-xl border border-red-400/30 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="h-[62px] w-full rounded-[18px] bg-[#101a32] px-5 text-base font-bold text-white shadow-[0_12px_24px_rgba(16,26,50,0.2)] transition hover:bg-[#1a2949] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#101a32]/20 disabled:cursor-not-allowed disabled:opacity-60 sm:mt-2 sm:h-[68px] sm:text-lg"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <p className="mt-6 text-center text-xs leading-5 text-[#77707e] sm:text-sm">
              VETRA Veterinary Clinic Management
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm">
              <span className="text-[#77707e]">New to VETRA?</span>
              <button
                type="button"
                onClick={() => router.push("/register")}
                className="font-bold text-[#087a91] underline-offset-4 transition hover:underline"
              >
                Register a clinic
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
