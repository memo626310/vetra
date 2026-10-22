import { createClient } from "@supabase/supabase-js";
import { clinicAuthStorage } from "@/lib/clinic-auth-storage";

export const vetraCore = createClient(
  process.env.NEXT_PUBLIC_VETRA_CORE_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_VETRA_CORE_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { storage: clinicAuthStorage } }
);
