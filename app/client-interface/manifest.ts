import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/client-interface",
    name: "VETRA Care",
    short_name: "VETRA",
    description: "Your pet's health records, vaccines, and care reminders.",
    start_url: "/client-interface",
    scope: "/client-interface",
    display: "standalone",
    display_override: ["standalone"],
    orientation: "portrait",
    background_color: "#0B1F45",
    theme_color: "#0B1F45",
    lang: "en",
    dir: "auto",
    categories: ["medical", "lifestyle"],
    icons: [
      {
        src: "/vetra-client-icons-20261012-androidfix/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/vetra-client-icons-20261012-androidfix/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/vetra-client-icons-20261012-androidfix/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}