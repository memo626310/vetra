import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "VETRA Clinic Settings",
  applicationName: "VETRA Clinic",
  manifest: "/settings/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "VETRA Clinic",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/vetra-client-icons-20261012-androidfix/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/vetra-client-icons-20261012-androidfix/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/vetra-client-icons-20261012/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function SettingsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}