"use client";

import { memberApi } from "@/lib/member-api";
import { useMemberResource } from "@/lib/use-member-resource";

interface PhotoSet { photoSetRef: string; capturedAt: string; completedAt: string | null; views: string[]; analysisStatus: string; analysisSummary: string | null; comparisonSummary: string | null; confidenceLabel: string | null }

export default function PhotosPage() {
  const { data, loading, error, reload } = useMemberResource<PhotoSet[]>("/api/v1/member/photos");
  async function remove(photoSetRef: string) { if (!window.confirm("متأكد تريد تحذف مجموعة الصور؟ الحذف ما يرجع.")) return; try { await memberApi(`/api/v1/member/photos/${encodeURIComponent(photoSetRef)}`, { method: "DELETE" }); await reload(); } catch (caught) { window.alert(caught instanceof Error ? caught.message : "تعذر الحذف"); } }
  if (loading) return <div className="member-state">نحمّل ملخصات الصور...</div>;
  if (error) return <div className="member-alert error">{error}</div>;
  return <div className="member-page"><header className="member-page-header"><p className="member-kicker">صور التقدم</p><h1>تغيّرك عبر الوقت</h1><p>نعرض التواريخ والتحليل النصي فقط. الصور الخاصة وروابط التخزين ما تنرسل بهاي الصفحة.</p></header>{data?.length ? data.map((set) => <section className="member-card" key={set.photoSetRef}><div className="member-card-heading"><div><h2>{new Date(set.capturedAt).toLocaleDateString("ar-IQ")}</h2><span className="member-pill">{set.analysisStatus}</span></div><button className="member-danger-button" onClick={() => void remove(set.photoSetRef)} type="button">حذف</button></div><p className="member-muted">الزوايا: {set.views.join(" · ") || "غير مكتملة"}</p>{set.analysisSummary ? <p>{set.analysisSummary}</p> : <p className="member-muted">ماكو تحليل نصي متوفر.</p>}{set.comparisonSummary ? <div className="member-analysis"><strong>المقارنة</strong><p>{set.comparisonSummary}</p></div> : null}</section>) : <div className="member-card">ماكو مجموعات صور محفوظة.</div>}</div>;
}
