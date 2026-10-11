import { redirect } from "next/navigation";

// Legacy URL only. The import workflow now starts at /settings/import.
export default function LegacyImportStagingRedirect() {
  redirect("/settings/import");
}
