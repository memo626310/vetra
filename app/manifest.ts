import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VETRA Pet Care",
    short_name: "VETRA",
    description: "VETRA Pet Care Portal",
    start_url: "/client-interface",
    display: "standalone",
    background_color: "#F8FBFF",
    theme_color: "#07111C",
    orientation: "portrait",
    scope: "/",
    id: "/",
    icons: [
      {
        src: "/vetra-client-icons-20261012-androidfix/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/vetra-client-icons-20261012-androidfix/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}


