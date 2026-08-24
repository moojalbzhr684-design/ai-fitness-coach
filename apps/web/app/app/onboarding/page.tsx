"use client";

import { useEffect, useState } from "react";
import { memberApi, redirectForMemberAuth } from "@/lib/member-api";

const steps = ["AGE", "SEX", "HEIGHT", "WEIGHT", "ACTIVITY", "EXPERIENCE", "GOAL", "TRAINING_DAYS", "SESSION_MINUTES", "TRAINING_PLACE", "MEALS_PER_DAY", "WEEKLY_FOOD_BUDGET"];

export default function MemberOnboardingPage() {
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const result = await memberApi<{ onboardingState: string }>("/api/v1/member/me");
        if (cancelled) return;
        if (result.onboardingState === "COMPLETE") {
          window.location.assign("/app");
          return;
        }
        setStep(result.onboardingState);
        setError(null);
      } catch (caught) {
        if (!redirectForMemberAuth(caught)) setError("ما گدرنا نتحقق من الإعداد. راح نحاول مرة ثانية.");
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const completed = step ? Math.max(0, steps.indexOf(step)) : 0;
  return <div className="member-page onboarding-page">
    <section className="member-hero">
      <p className="member-kicker">خطوة أخيرة للنسخة التجريبية</p>
      <h1>كمّل ملفك من محادثة البوت</h1>
      <p>رجعنا نستخدم نفس أسئلة Telegram وخدمات الملف حتى ما يصير عندك حساب أو بيانات مكررة. جاوب الأسئلة هناك، وهذه الصفحة تفتح التطبيق تلقائياً من تخلص.</p>
    </section>
    {error ? <div className="member-alert error" role="alert">{error}</div> : null}
    <section className="member-card onboarding-status" aria-live="polite">
      <div className="onboarding-progress"><span style={{ width: `${Math.round((completed / steps.length) * 100)}%` }} /></div>
      <h2>{step ? `الإعداد جاري · خطوة ${completed + 1} من ${steps.length}` : "نراجع حالة ملفك..."}</h2>
      <p className="member-muted">افتح محادثة AI Fitness Coach في Telegram وكمل من آخر سؤال وصلك.</p>
      <button className="member-secondary-button" onClick={() => window.location.reload()} type="button">تحقق هسه</button>
    </section>
  </div>;
}
