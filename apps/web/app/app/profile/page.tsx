"use client";

import { FormEvent, useEffect, useState } from "react";
import { memberApi } from "@/lib/member-api";
import { useMemberResource } from "@/lib/use-member-resource";

interface MeData {
  displayName: string;
  email: string | null;
  gym: null | { displayName: string };
  trainer: null | { displayName: string };
  coach: { displayName: string };
  profile: null | {
    heightCm: number | null;
    weightKg: number | null;
    goal: string | null;
    activityLevel: string | null;
    experienceLevel: string | null;
    trainingDaysPerWeek: number | null;
    sessionMinutes: number | null;
    trainingPlace: string | null;
    mealsPerDay: number | null;
  };
}

export default function ProfilePage() {
  const { data, loading, error, reload } = useMemberResource<MeData>("/api/v1/member/me");
  const [form, setForm] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (data?.profile) setForm(Object.fromEntries(Object.entries(data.profile).map(([key, value]) => [key, value === null ? "" : String(value)])));
  }, [data]);
  async function save(event: FormEvent) {
    event.preventDefault();
    const body = {
      heightCm: Number(form.heightCm), activityLevel: form.activityLevel, experienceLevel: form.experienceLevel,
      goal: form.goal, trainingDaysPerWeek: Number(form.trainingDaysPerWeek), sessionMinutes: Number(form.sessionMinutes),
      trainingPlace: form.trainingPlace, mealsPerDay: Number(form.mealsPerDay),
    };
    try {
      await memberApi("/api/v1/member/profile", { method: "PATCH", body: JSON.stringify(body) });
      if (Number(form.weightKg) !== data?.profile?.weightKg) {
        await memberApi("/api/v1/member/weight", { method: "POST", body: JSON.stringify({ weightKg: Number(form.weightKg) }) });
      }
      setNotice("تحدث ملفك");
      await reload();
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "تعذر تحديث الملف"); }
  }
  if (loading) return <div className="member-state">نحمّل ملفك...</div>;
  if (error || !data) return <div className="member-alert error">{error ?? "الملف مو متوفر"}</div>;
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="member-page">
    <header className="member-page-header"><p className="member-kicker">الملف</p><h1>{data.displayName}</h1><p>{data.gym?.displayName ?? "مستخدم مستقل"} · المدرب: {data.trainer?.displayName ?? data.coach.displayName}</p></header>
    {notice ? <div className="member-alert">{notice}</div> : null}
    <section className="member-card"><form className="member-form member-form-grid" onSubmit={save}>
      <label>الطول سم<input type="number" min={100} max={250} value={form.heightCm ?? ""} onChange={(event) => set("heightCm", event.target.value)} required /></label>
      <label>الوزن الحالي<input type="number" min={30} max={300} step="0.1" value={form.weightKg ?? ""} onChange={(event) => set("weightKg", event.target.value)} required /><small>ينحفظ كقياس جديد بخدمة التقدم.</small></label>
      <label>الهدف<select value={form.goal ?? ""} onChange={(event) => set("goal", event.target.value)} required><option value="FAT_LOSS">خسارة دهون</option><option value="MUSCLE_GAIN">بناء عضل</option><option value="RECOMPOSITION">إعادة تركيب</option><option value="STRENGTH">قوة</option><option value="GENERAL_FITNESS">لياقة عامة</option></select></label>
      <label>النشاط<select value={form.activityLevel ?? ""} onChange={(event) => set("activityLevel", event.target.value)} required><option value="SEDENTARY">قليل</option><option value="LIGHT">خفيف</option><option value="MODERATE">متوسط</option><option value="HIGH">عالي</option><option value="VERY_HIGH">عالي جداً</option></select></label>
      <label>الخبرة<select value={form.experienceLevel ?? ""} onChange={(event) => set("experienceLevel", event.target.value)} required><option value="BEGINNER">مبتدئ</option><option value="INTERMEDIATE">متوسط</option></select></label>
      <label>أيام التمرين<input type="number" min={1} max={7} value={form.trainingDaysPerWeek ?? ""} onChange={(event) => set("trainingDaysPerWeek", event.target.value)} required /></label>
      <label>مدة الجلسة<input type="number" min={20} max={180} value={form.sessionMinutes ?? ""} onChange={(event) => set("sessionMinutes", event.target.value)} required /></label>
      <label>مكان التمرين<select value={form.trainingPlace ?? ""} onChange={(event) => set("trainingPlace", event.target.value)} required><option value="GYM">قاعة</option><option value="HOME">بيت</option><option value="BOTH">الاثنين</option></select></label>
      <label>وجبات باليوم<input type="number" min={2} max={6} value={form.mealsPerDay ?? ""} onChange={(event) => set("mealsPerDay", event.target.value)} required /></label>
      <button className="member-primary-button" type="submit">حفظ التغييرات</button>
    </form></section>
    <section className="member-card"><h2>الهوية</h2><p>{data.email ?? "ماكو إيميل مرتبط"}</p><p className="member-muted">الربط يحتاج تحقق بكود. الأدوار والصلاحيات ما تنعدل من ملف العضو.</p></section>
  </div>;
}
