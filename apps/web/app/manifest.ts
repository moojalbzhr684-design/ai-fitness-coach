import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI Fitness Coach",
    short_name: "Fitness Coach",
    description: "بوابة العضو للتمرين والتغذية والتقدم والمدرب الذكي.",
    start_url: "/app",
    display: "standalone",
    background_color: "#f4f7fb",
    theme_color: "#2563eb",
    orientation: "portrait-primary",
    icons: [{ src: "/member-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
