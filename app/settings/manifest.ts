import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "VETRA Clinic",
    short_name: "VETRA Clinic",
    description: "VETRA veterinary clinic management app for doctors.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    display_override: ["standalone"],
    orientation: "portrait",
    background_color: "#F7F8FA",
    theme_color: "#0B2540",
    lang: "en",
    categories: ["medical", "productivity"],
    icons: [
      { src: "/vetra-client-icons-20261012-androidfix/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/vetra-client-icons-20261012-androidfix/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/vetra-client-icons-20261012-androidfix/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}