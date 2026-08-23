import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AI Fitness Coach Dashboard", template: "%s · AI Fitness Coach" },
  description: "Secure multi-gym operations dashboards for platform administrators, gym owners, and trainers.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
