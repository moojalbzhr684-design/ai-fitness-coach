"use client";

import { FormEvent, useState } from "react";
import { memberApi } from "@/lib/member-api";
import { useMemberResource } from "@/lib/use-member-resource";

interface Exercise { order: number; name: string; sets?: number; repMin?: number; repMax?: number; prescribedSets?: number }
interface WorkoutData {
  program: null | { name: string; split: string; days: Array<{ dayNumber: number; name: string; exercises: Exercise[] }> };
  current: null | { day: null | { name: string }; exercises: Array<Exercise & { sets: Array<{ setNumber: number; weightKg: number | null; reps: number; rir: number | null }> }> };
  recent: unknown[];
}
interface FinishSummary {
  durationMinutes: number | null;
  exercises: Array<{ exercise: { name: string }; recommendation: { message: string; recommendedWeightKg?: number | null } }>;
}

export default function WorkoutPage() {
  const { data, loading, error, reload } = useMemberResource<WorkoutData>("/api/v1/member/workout");
  const [dayNumber, setDayNumber] = useState(1);
  const [exerciseReference, setExerciseReference] = useState("1");
  const [setNumber, setSetNumber] = useState(1);
  const [weightKg, setWeightKg] = useState(0);
  const [reps, setReps] = useState(10);
  const [rir, setRir] = useState(2);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finishSummary, setFinishSummary] = useState<FinishSummary | null>(null);

  async function action(path: string, body: object) {
    setBusy(true); setNotice(null);
    try { await memberApi(path, { method: "POST", body: JSON.stringify(body) }); setNotice("تمت العملية بنجاح"); await reload(); }
    catch (caught) { setNotice(caught instanceof Error ? caught.message : "تعذر تنفيذ العملية"); }
    finally { setBusy(false); }
  }
  async function logSet(event: FormEvent) {
    event.preventDefault();
    await action("/api/v1/member/workout/set", { exerciseReference, setNumber, weightKg, reps, rir });
  }
  async function finishWorkout() {
    setBusy(true); setNotice(null);
    try {
      const result = await memberApi<{ status: string } & FinishSummary>("/api/v1/member/workout/finish", { method: "POST", body: JSON.stringify({ notes: null }) });
      setFinishSummary(result); setNotice("اكتمل تمرينك"); await reload();
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "تعذر إنهاء التمرين"); }
    finally { setBusy(false); }
  }
  if (loading) return <div className="member-state">نحمّل تمرينك...</div>;
  if (error || !data) return <div className="member-alert error">{error ?? "التمرين مو متوفر"}</div>;
  return <div className="member-page">
    <header className="member-page-header"><p className="member-kicker">التمرين</p><h1>{data.current?.day?.name ?? data.program?.name ?? "ماكو برنامج فعال"}</h1><p>{data.program ? `${data.program.split} · ${data.program.days.length} أيام` : "راجع المدرب حتى يجهز برنامجك"}</p></header>
    {notice ? <div className="member-alert">{notice}</div> : null}
    {finishSummary ? <section className="member-card"><h2>ملخص وتوصيات الجلسة</h2><p className="member-muted">المدة: {finishSummary.durationMinutes ?? "—"} دقيقة</p>{finishSummary.exercises.map((item) => <div className="exercise-row" key={item.exercise.name}><strong>{item.exercise.name}</strong><span>{item.recommendation.message}{item.recommendation.recommendedWeightKg ? ` · ${item.recommendation.recommendedWeightKg} كغم` : ""}</span></div>)}</section> : null}
    {data.current ? <>
      <section className="member-card"><div className="member-card-heading"><h2>الجلسة الحالية</h2><button className="member-danger-button" disabled={busy} onClick={() => void finishWorkout()}>إنهاء التمرين</button></div><div className="exercise-list">{data.current.exercises.map((exercise) => <div className="exercise-row" key={exercise.order}><strong>{exercise.order}. {exercise.name}</strong><span>{exercise.sets.length}/{exercise.prescribedSets ?? "—"} مجموعات</span></div>)}</div></section>
      <section className="member-card"><h2>سجل مجموعة</h2><form className="member-form member-form-grid" onSubmit={logSet}>
        <label>التمرين<select value={exerciseReference} onChange={(event) => setExerciseReference(event.target.value)}>{data.current.exercises.map((exercise) => <option value={exercise.order} key={exercise.order}>{exercise.order}. {exercise.name}</option>)}</select></label>
        <label>رقم المجموعة<input type="number" min={1} max={20} value={setNumber} onChange={(event) => setSetNumber(Number(event.target.value))} /></label>
        <label>الوزن كغم<input type="number" min={0} max={1000} step="0.5" value={weightKg} onChange={(event) => setWeightKg(Number(event.target.value))} /></label>
        <label>العدات<input type="number" min={1} max={100} value={reps} onChange={(event) => setReps(Number(event.target.value))} /></label>
        <label>RIR<input type="number" min={0} max={5} value={rir} onChange={(event) => setRir(Number(event.target.value))} /></label>
        <button className="member-primary-button" disabled={busy} type="submit">سجل المجموعة</button>
      </form></section>
    </> : <section className="member-card"><h2>ابدأ تمرينك</h2>{data.program ? <><label className="member-field">اليوم<select value={dayNumber} onChange={(event) => setDayNumber(Number(event.target.value))}>{data.program.days.map((day) => <option value={day.dayNumber} key={day.dayNumber}>{day.dayNumber}. {day.name}</option>)}</select></label><button className="member-primary-button" disabled={busy} onClick={() => void action("/api/v1/member/workout/start", { dayNumber })}>ابدأ التمرين</button></> : <p className="member-muted">ماكو برنامج فعال حالياً.</p>}</section>}
    {data.program ? <section className="member-card"><h2>تقسيم البرنامج</h2>{data.program.days.map((day) => <details className="workout-day" key={day.dayNumber}><summary>{day.dayNumber}. {day.name}</summary>{day.exercises.map((exercise) => <div className="exercise-row" key={exercise.order}><strong>{exercise.order}. {exercise.name}</strong><span>{exercise.sets} × {exercise.repMin}-{exercise.repMax}</span></div>)}</details>)}</section> : null}
  </div>;
}
