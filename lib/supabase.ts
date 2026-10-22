import { createClient } from "@supabase/supabase-js";
import { clinicAuthStorage } from "@/lib/clinic-auth-storage";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { storage: clinicAuthStorage } }
);
