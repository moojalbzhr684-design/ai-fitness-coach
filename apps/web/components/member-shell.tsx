"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { memberApi, redirectForMemberAuth } from "@/lib/member-api";

const links = [
  { href: "/app", label: "الرئيسية", icon: "⌂" },
  { href: "/app/coach", label: "المدرب", icon: "✦" },
  { href: "/app/workout", label: "التمرين", icon: "◫" },
  { href: "/app/nutrition", label: "الغذاء", icon: "◉" },
  { href: "/app/progress", label: "التقدم", icon: "↗" },
];

export function MemberShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onboardingPage = pathname === "/app/onboarding";
  const [branding, setBranding] = useState({ displayName: "AI Fitness Coach", primaryColor: "#2563eb", secondaryColor: "#16a34a" });
  const [gymSelection, setGymSelection] = useState<{ required: boolean; options: Array<{ gymRef: string; displayName: string }> }>({ required: false, options: [] });
  useEffect(() => {
    if (pathname === "/app/login") return;
    void memberApi<{ onboardingState?: string; branding?: { displayName: string; primaryColor: string; secondaryColor: string }; gymSelectionRequired?: boolean; gymOptions?: Array<{ gymRef: string; displayName: string }> }>("/api/v1/member/me")
      .then((data) => {
        const onboardingState = data.onboardingState;
        if (onboardingState && onboardingState !== "COMPLETE" && pathname !== "/app/onboarding") {
          window.location.assign("/app/onboarding");
          return;
        }
        if (onboardingState === "COMPLETE" && pathname === "/app/onboarding") {
          window.location.assign("/app");
          return;
        }
        if (data.branding) setBranding(data.branding);
        setGymSelection({ required: Boolean(data.gymSelectionRequired), options: data.gymOptions ?? [] });
      })
      .catch((error) => { redirectForMemberAuth(error); });
  }, [pathname]);
  if (pathname === "/app/login") return children;
  async function logout() {
    try { await memberApi("/api/v1/auth/logout", { method: "POST" }); } finally { window.sessionStorage.removeItem("afc_member_csrf"); window.sessionStorage.removeItem("afc_member_gym"); window.location.assign("/login"); }
  }
  return <div className="member-shell" dir="rtl" style={{ "--member-primary": branding.primaryColor, "--member-secondary": branding.secondaryColor } as React.CSSProperties}>
    <header className="member-topbar">
      <Link href="/app" className="member-brand"><span>AF</span><strong>{branding.displayName}</strong><em className="beta-badge">Beta</em></Link>
      <div className="member-top-actions"><Link href="/app/photos">الصور</Link><Link href="/app/profile">الملف</Link><button onClick={() => void logout()} type="button">خروج</button></div>
    </header>
    <main className="member-content">{gymSelection.required && !onboardingPage ? <section className="member-card member-gym-picker"><p className="member-kicker">اختيار القاعة</p><h2>حدد القاعة اللي تريد تفتح بياناتها</h2><select defaultValue="" onChange={(event) => { if (event.target.value) { window.sessionStorage.setItem("afc_member_gym", event.target.value); window.location.reload(); } }}><option value="" disabled>اختر القاعة</option>{gymSelection.options.map((gym) => <option value={gym.gymRef} key={gym.gymRef}>{gym.displayName}</option>)}</select></section> : children}</main>
    {!onboardingPage ? <nav className="member-bottom-nav" aria-label="تنقل العضو">{links.map((link) => <Link className={pathname === link.href ? "active" : ""} href={link.href} key={link.href}><span aria-hidden="true">{link.icon}</span>{link.label}</Link>)}</nav> : null}
  </div>;
}
