"use client";

import Link from "next/link";
import { useMemberResource } from "@/lib/use-member-resource";

interface HomeData {
  greeting: string;
  coach: { displayName: string };
  branding?: { displayName: string; primaryColor: string; secondaryColor: string };
  workout: null | { status: string; day?: { name: string }; program?: string };
  nutritionTarget: null | { calories: number; proteinGrams: number };
  weight: null | { currentKg: number | null; totalChangeKg: number | null; trend?: { direction?: string } };
  checkIn: { draft: null | { currentStep: string }; latestStatus: string | null };
  pendingReview: null | { status: string; type: string };
  photoProgress: null | { overallSummary?: string | null; comparisonSummary?: string | null };
}

export default function MemberHomePage() {
  const { data, loading, error } = useMemberResource<HomeData>("/api/v1/member/home");
  if (loading) return <div className="member-state">نجهز صفحتك...</div>;
  if (error || !data) return <div className="member-alert error">{error ?? "البيانات مو متوفرة"}</div>;
  return <div className="member-page" style={{ "--member-primary": data.branding?.primaryColor ?? "#2563eb", "--member-secondary": data.branding?.secondaryColor ?? "#16a34a" } as React.CSSProperties}>
    <section className="member-hero"><p className="member-kicker">{data.branding?.displayName ?? "AI Fitness Coach"}</p><h1>هلا {data.greeting}</h1><p>مدربك <strong>{data.coach.displayName}</strong> جاهز يساعدك حسب بياناتك الحقيقية.</p><Link className="member-primary-button" href="/app/coach">اسأل المدرب</Link></section>
    <div className="member-stat-grid"><Link className="member-stat" href="/app/workout"><span>تمرينك</span><strong>{data.workout?.day?.name ?? data.workout?.program ?? "جاهز للبدء"}</strong><small>{data.workout?.status ?? "ماكو جلسة حالياً"}</small></Link><Link className="member-stat" href="/app/nutrition"><span>هدف اليوم</span><strong>{data.nutritionTarget?.calories ?? "—"} سعرة</strong><small>{data.nutritionTarget?.proteinGrams ?? "—"}غ بروتين</small></Link><Link className="member-stat" href="/app/progress"><span>وزنك الحالي</span><strong>{data.weight?.currentKg ?? "—"} كغم</strong><small>{data.weight?.totalChangeKg === null || data.weight?.totalChangeKg === undefined ? "ماكو اتجاه كافي" : `${data.weight.totalChangeKg > 0 ? "+" : ""}${data.weight.totalChangeKg} كغم`}</small></Link><Link className="member-stat" href="/app/progress"><span>المراجعة</span><strong>{data.checkIn.draft ? "غير مكتملة" : data.checkIn.latestStatus ?? "ماكو مراجعة"}</strong><small>{data.pendingReview ? `طلب ${data.pendingReview.status}` : "ماكو طلب معلق"}</small></Link></div>
    <section className="member-card"><div className="member-card-heading"><h2>اختصارات</h2></div><div className="member-quick-grid"><Link href="/app/coach">✦ احچي ويا المدرب</Link><Link href="/app/workout">◫ سجل تمرينك</Link><Link href="/app/nutrition">◉ شوف وجباتك</Link><Link href="/app/progress">↗ تابع تقدمك</Link><Link href="/app/photos">▣ صور التقدم</Link><Link href="/app/profile">◎ ملفك</Link></div></section>
    {data.photoProgress?.comparisonSummary || data.photoProgress?.overallSummary ? <section className="member-card"><p className="member-kicker">آخر تحليل صور</p><p>{data.photoProgress.comparisonSummary ?? data.photoProgress.overallSummary}</p></section> : null}
  </div>;
}
