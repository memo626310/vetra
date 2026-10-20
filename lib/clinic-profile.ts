import type { SupabaseClient } from "@supabase/supabase-js";

export type ClinicProfile = {
  clinic_id: string;
  display_name: string;
  doctor_name?: string | null;
  doctor_name_changed_at?: string | null;
  website_url: string | null;
  logo_url: string | null;
  logo_path: string | null;
  updated_at?: string;
};

export async function loadClinicProfile(db: SupabaseClient, clinicId: string) {
  const { data, error } = await db
    .from("clinic_profile_settings")
    .select("clinic_id,display_name,doctor_name,doctor_name_changed_at,website_url,logo_url,logo_path,updated_at")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (error) {
    const legacy = await db
      .from("clinic_profile_settings")
      .select("clinic_id,display_name,website_url,logo_url,logo_path,updated_at")
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (legacy.error) return null;
    return legacy.data as ClinicProfile | null;
  }
  return data as ClinicProfile | null;
}
