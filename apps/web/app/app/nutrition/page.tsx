"use client";

import Link from "next/link";
import { useState } from "react";
import { memberApi } from "@/lib/member-api";
import { useMemberResource } from "@/lib/use-member-resource";

interface NutritionData { name: string; target: { calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number }; meals: Array<{ order: number; name: string; items: Array<{ order: number; name: string; nameAr: string | null; quantityGrams: number; calories: number; proteinGrams: number }> }> }
interface Alternatives { original: { name: string; nameAr: string | null; quantityGrams: number }; alternatives: Array<{ food: { name: string; nameAr?: string | null }; quantityGrams: number; calories: number; proteinGrams: number }> }

export default function NutritionPage() {
  const { data, loading, error } = useMemberResource<NutritionData | null>("/api/v1/member/nutrition");
  const [alternatives, setAlternatives] = useState<Alternatives | null>(null); const [alternativeError, setAlternativeError] = useState<string | null>(null);
  async function loadAlternatives(mealNumber: number, foodNumber: number) { setAlternativeError(null); try { setAlternatives(await memberApi<Alternatives>(`/api/v1/member/nutrition/substitutions?mealNumber=${mealNumber}&foodNumber=${foodNumber}`)); } catch (caught) { setAlternativeError(caught instanceof Error ? caught.message : "ما لگينا بدائل"); } }
  if (loading) return <div className="member-state">نحمّل نظامك الغذائي...</div>;
  if (error) return <div className="member-alert error">{error}</div>;
  if (!data) return <div className="member-page"><header className="member-page-header"><h1>التغذية</h1></header><div className="member-card">ماكو نظام غذائي فعال حالياً.</div></div>;
  return <div className="member-page"><header className="member-page-header"><p className="member-kicker">التغذية</p><h1>{data.name}</h1><p>الأهداف محسوبة من خدمة التغذية. تغيير السعرات يحتاج مسار مراجعة معتمد.</p></header><div className="member-stat-grid nutrition-stats"><div className="member-stat"><span>السعرات</span><strong>{data.target.calories}</strong></div><div className="member-stat"><span>البروتين</span><strong>{data.target.proteinGrams}غ</strong></div><div className="member-stat"><span>الكارب</span><strong>{data.target.carbsGrams}غ</strong></div><div className="member-stat"><span>الدهون</span><strong>{data.target.fatGrams}غ</strong></div></div>{data.meals.map((meal) => <section className="member-card" key={meal.order}><div className="member-card-heading"><h2>{meal.order}. {meal.name}</h2></div><div className="meal-list">{meal.items.map((item) => <div className="meal-row" key={item.order}><div><strong>{item.nameAr ?? item.name}</strong><small>{item.quantityGrams}غ · {Math.round(item.calories)} سعرة · {Math.round(item.proteinGrams)}غ بروتين</small></div><button className="member-secondary-button" onClick={() => void loadAlternatives(meal.order, item.order)} type="button">بدائل</button></div>)}</div></section>)}{alternativeError ? <div className="member-alert error">{alternativeError}</div> : null}{alternatives ? <section className="member-card alternatives-card"><h2>بدائل {alternatives.original.nameAr ?? alternatives.original.name}</h2>{alternatives.alternatives.length ? alternatives.alternatives.map((item, index) => <div className="meal-row" key={`${item.food.name}-${index}`}><strong>{item.food.nameAr ?? item.food.name}</strong><span>{Math.round(item.quantityGrams)}غ · {Math.round(item.proteinGrams)}غ بروتين</span></div>) : <p>ماكو بدائل مناسبة لقيودك الغذائية حالياً.</p>}</section> : null}<Link className="member-primary-button member-wide-button" href="/app/coach">اسأل المدرب عن الغذاء</Link></div>;
}
