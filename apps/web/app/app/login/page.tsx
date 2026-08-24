"use client";

import { FormEvent, useState } from "react";
import { memberApi, rememberMemberCsrfToken } from "@/lib/member-api";

type RequestResult = { challengeId: string; expiresAt: string; message: string };
type VerifyResult = { csrfToken: string; expiresAt: string };

export default function MemberLoginPage() {
  const [email, setEmail] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      if (!challengeId) {
        const result = await memberApi<RequestResult>("/api/v1/auth/otp/request", { method: "POST", body: JSON.stringify({ email }) });
        setChallengeId(result.challengeId);
      } else {
        const result = await memberApi<VerifyResult>("/api/v1/auth/otp/verify", { method: "POST", body: JSON.stringify({ email, challengeId, code }) });
        rememberMemberCsrfToken(result.csrfToken);
        window.sessionStorage.removeItem("afc_member_gym");
        window.location.assign("/app");
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر تسجيل الدخول"); }
    finally { setBusy(false); }
  }
  return <main className="member-login" dir="rtl"><section className="member-login-card"><div className="member-login-logo">AF</div><p className="member-kicker">بوابة العضو</p><h1>مدربك وياك بكل مكان</h1><p className="member-muted">نسجل دخولك بكود مؤقت يوصلك على الإيميل. ما نستخدم كلمات مرور.</p>{error ? <div className="member-alert error">{error}</div> : null}<form onSubmit={submit} className="member-form"><label>الإيميل<input dir="ltr" type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={Boolean(challengeId)} required autoComplete="email" /></label>{challengeId ? <label>الكود المؤقت<input dir="ltr" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required autoComplete="one-time-code" /></label> : null}<button className="member-primary-button" disabled={busy} type="submit">{busy ? "لحظة..." : challengeId ? "دخول" : "أرسل الكود"}</button></form>{challengeId ? <button className="member-text-button" onClick={() => { setChallengeId(null); setCode(""); }} type="button">غيّر الإيميل</button> : null}<p className="member-privacy">في بيئة التطوير فقط يظهر الكود في console الخادم. الإنتاج يفشل بأمان بدون مزود إيميل حقيقي.</p></section></main>;
}
