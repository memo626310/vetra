import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

// VETRA_CLINIC_PWA_LAYOUT
export const metadata: Metadata = {
  title: "VETRA Clinic",
  description: "VETRA veterinary clinic management app.",
  applicationName: "VETRA Clinic",
  manifest: "/dashboard/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "VETRA Clinic",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      {
        url: "/vetra-client-icons-20261012-androidfix/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/vetra-client-icons-20261012-androidfix/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/vetra-client-icons-20261012/icon-180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B2540",
};

export default function ClinicDashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}
