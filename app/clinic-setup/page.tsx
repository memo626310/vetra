"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";

export default function ClinicSetupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await vetraCore.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      setLoading(false);
    }

    checkUser();
  }, [router]);

  async function handleCreateClinic(e: React.FormEvent) {
    e.preventDefault();

    setError("");

    if (!name.trim()) {
      setError("Please enter your clinic name.");
      return;
    }

    setSaving(true);

    const { data, error: rpcError } = await vetraCore.rpc(
      "create_my_first_clinic",
      {
        p_name: name.trim(),
        p_phone: phone.trim() || null,
        p_country: "Egypt",
        p_city: city.trim() || null,
        p_address: address.trim() || null,
      }
    );

    if (rpcError) {
      console.error("CREATE CLINIC ERROR:", rpcError);
      setError(rpcError.message);
      setSaving(false);
      return;
    }

    if (!data) {
      setError("Clinic could not be created.");
      setSaving(false);
      return;
    }

    /*
      For now we only create the clinic record in VETRA Core.
      Database provisioning will be connected in the next step.
    */

    router.replace("/dashboard");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="text-5xl">🐾</div>
          <p className="mt-4 text-sm text-slate-500">
            Loading VETRA...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto flex min-h-[85vh] max-w-lg items-center justify-center">
        <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">

          <div className="mb-8 text-center">
            <div className="mb-4 text-5xl">🏥</div>

            <h1 className="text-3xl font-black">
              Set up your clinic
            </h1>

            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Tell us a little about your clinic
            </p>
          </div>

          <form onSubmit={handleCreateClinic} className="space-y-5">

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Clinic Name
              </label>

              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Happy Paws Veterinary Clinic"
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-slate-500 dark:focus:ring-slate-700"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Clinic Phone
              </label>

              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-slate-500 dark:focus:ring-slate-700"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">
                City
              </label>

              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Cairo"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-slate-500 dark:focus:ring-slate-700"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Address
              </label>

              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Clinic address"
                rows={3}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-slate-500 dark:bg-slate-800 dark:focus:border-slate-500"
              />
            </div>

            {error && (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-2xl bg-slate-900 px-5 py-3.5 font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900"
            >
              {saving ? "Creating clinic..." : "Create My Clinic"}
            </button>

          </form>
        </div>
      </div>
    </main>
  );
}