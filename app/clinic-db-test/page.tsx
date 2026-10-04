"use client";

import { useEffect, useState } from "react";
import { getClinicDb } from "@/lib/clinic-db";

export default function ClinicDbTestPage() {
  const [status, setStatus] = useState("Testing...");
  const [details, setDetails] = useState("");

  useEffect(() => {
    async function test() {
      try {
        const db = await getClinicDb();

        const {
          data: { session },
        } = await db.auth.getSession();

        const { count, error } = await db
          .from("clients")
          .select("id", {
            count: "exact",
            head: true,
          });

        if (error) {
          throw error;
        }

        setStatus("✅ Clinic Database Connected");
        setDetails(
          `Clients found: ${count ?? 0}\nClinic DB session: ${
            session ? "active" : "none"
          }`
        );
      } catch (error) {
        console.error(error);

        setStatus("❌ Clinic Database Failed");
        setDetails(
          error instanceof Error
            ? error.message
            : "Unknown error"
        );
      }
    }

    void test();
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <div className="mx-auto max-w-2xl rounded-3xl bg-slate-900 p-8">
        <h1 className="mb-4 text-2xl font-bold">
          VETRA Clinic DB Test
        </h1>

        <div className="text-lg font-semibold">
          {status}
        </div>

        <pre className="mt-6 whitespace-pre-wrap rounded-2xl bg-slate-950 p-5 text-sm text-slate-300">
          {details}
        </pre>
      </div>
    </main>
  );
}