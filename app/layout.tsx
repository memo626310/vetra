import type { Metadata, Viewport } from "next";
import "./globals.css";
import AuthGuard from "@/components/AuthGuard";
import ClinicMobileNavigation from "@/components/ClinicMobileNavigation";
import PwaInstallProvider from "@/components/PwaInstallProvider";
import ThemeBridge from "@/components/ThemeBridge";
import PlatformActivityTracker from "@/components/PlatformActivityTracker";
import { StaffPermissionsProvider } from "@/lib/use-staff-permissions";

export const metadata: Metadata = {
  title: "VETRA",
  description: "Veterinary Clinic Management System",
  applicationName: "VETRA",
  appleWebApp: { capable: true, title: "VETRA", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07111C",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ThemeBridge />
        <PwaInstallProvider>
          <StaffPermissionsProvider>
            <PlatformActivityTracker />
            <AuthGuard>{children}</AuthGuard>
            <ClinicMobileNavigation />
          </StaffPermissionsProvider>
        </PwaInstallProvider>
      </body>
    </html>
  );
}


