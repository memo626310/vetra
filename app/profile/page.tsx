"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  branch: string | null;
  language: string;
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [branch, setBranch] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    setProfile(data);
    setFullName(data.full_name || "");
    setPhone(data.phone || "");
    setBranch(data.branch || "");

    setLoading(false);
  }

  async function saveProfile() {
    if (!profile) return;

    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone: phone || null,
        branch: branch || null,
      })
      .eq("id", profile.id);

    if (error) {
      setMessage("Failed to save changes.");
      setSaving(false);
      return;
    }

    setMessage("Profile updated successfully.");
    setSaving(false);

    await loadProfile();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-slate-500">
          Loading profile...
        </p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-red-500">
          Profile not found.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 dark:bg-slate-950 dark:text-white sm:px-8 lg:px-12">

      <div className="mx-auto max-w-3xl">

        <button
          onClick={() => window.location.href = "/"}
          className="mb-6 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-900 dark:hover:text-white"
        >
          ← Back to dashboard
        </button>

        <div className="mb-8">
          <p className="text-sm font-medium text-slate-400">
            VETRA
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight">
            My Profile
          </h1>

          <p className="mt-2 text-slate-500 dark:text-slate-400">
            Manage your personal information.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">

          {/* Profile Header */}

          <div className="mb-8 flex items-center gap-5">

            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-100 text-3xl dark:bg-blue-500/10">
              👨‍⚕️
            </div>

            <div>
              <h2 className="text-xl font-bold">
                {profile.full_name}
              </h2>

              <p className="mt-1 text-sm capitalize text-slate-500">
                {profile.role}
              </p>
            </div>

          </div>

          <div className="space-y-5">

            {/* Name */}

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Full name
              </label>

              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-blue-500 dark:focus:ring-blue-500/10"
              />
            </div>

            {/* Email */}

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Email
              </label>

              <input
                value={profile.email || ""}
                disabled
                className="w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
              />
            </div>

            {/* Phone */}

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Phone
              </label>

              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01000000000"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-blue-500 dark:focus:ring-blue-500/10"
              />
            </div>

            {/* Role */}

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Role
              </label>

              <input
                value={profile.role}
                disabled
                className="w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 capitalize text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
              />
            </div>

            {/* Branch */}

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Branch
              </label>

              <input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="El Marg"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-blue-500 dark:focus:ring-blue-500/10"
              />
            </div>

          </div>

          {message && (
            <div className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              {message}
            </div>
          )}

          <div className="mt-8 flex justify-end">

            <button
              onClick={saveProfile}
              disabled={saving}
              className="rounded-2xl bg-slate-900 px-6 py-3 font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>

          </div>

        </div>
      </div>
    </main>
  );
}