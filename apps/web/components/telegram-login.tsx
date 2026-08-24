"use client";

import { useEffect, useRef, useState } from "react";
import { memberApi, MemberApiError, rememberMemberCsrfToken } from "@/lib/member-api";

type TelegramChallenge = {
  challengeId: string;
  browserToken: string;
  expiresAt: string;
  telegramUrl: string;
};

type TelegramStatus = {
  status: "PENDING" | "VERIFIED";
  csrfToken?: string;
  expiresAt: string;
};

const STORAGE_KEY = "afc_telegram_login";

function restoreChallenge(): TelegramChallenge | null {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as TelegramChallenge;
    if (!parsed.challengeId || !parsed.browserToken || !parsed.telegramUrl || Date.parse(parsed.expiresAt) <= Date.now()) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function TelegramLogin() {
  const [challenge, setChallenge] = useState<TelegramChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("جاهز للدخول");
  const [error, setError] = useState<string | null>(null);
  const polling = useRef(false);

  useEffect(() => { setChallenge(restoreChallenge()); }, []);
  useEffect(() => {
    void memberApi("/api/v1/member/me")
      .then(() => window.location.assign("/app"))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!challenge) return;
    let cancelled = false;
    const check = async () => {
      if (cancelled || polling.current) return;
      polling.current = true;
      try {
        const result = await memberApi<TelegramStatus>("/api/v1/auth/telegram/status", {
          method: "POST",
          body: JSON.stringify({ challengeId: challenge.challengeId, browserToken: challenge.browserToken }),
        });
        if (result.status === "VERIFIED" && result.csrfToken) {
          rememberMemberCsrfToken(result.csrfToken);
          window.sessionStorage.removeItem(STORAGE_KEY);
          window.sessionStorage.removeItem("afc_member_gym");
          setStatus("تم التحقق، نفتح حسابك...");
          window.location.assign("/app");
          return;
        }
        setStatus("ننتظر تأكيدك من بوت Telegram...");
      } catch (caught) {
        if (caught instanceof MemberApiError && [400, 410].includes(caught.status)) {
          window.sessionStorage.removeItem(STORAGE_KEY);
          setChallenge(null);
          setError("رابط الدخول انتهى أو انستخدم. اطلب رابط جديد.");
        } else {
          setStatus("الاتصال متأخر شوي، راح نحاول تلقائياً.");
        }
      } finally {
        polling.current = false;
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 2_500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [challenge]);

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const result = await memberApi<TelegramChallenge>("/api/v1/auth/telegram/request", {
        method: "POST",
        body: JSON.stringify({}),
      });
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      setChallenge(result);
      setStatus("افتح Telegram وأكد الدخول من البوت.");
      window.location.assign(result.telegramUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر بدء تسجيل الدخول");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    window.sessionStorage.removeItem(STORAGE_KEY);
    setChallenge(null);
    setError(null);
    setStatus("جاهز للدخول");
  }

  return <section className="member-login-card" aria-busy={busy}>
    <div className="beta-lockup"><div className="member-login-logo" aria-hidden="true">AF</div><span className="beta-badge">Public Beta</span></div>
    <p className="member-kicker">AI Fitness Coach</p>
    <h1>مدربك وياك بكل مكان</h1>
    <p className="member-muted">دخول آمن عن طريق حسابك في Telegram. البوت يأكد هويتك، وما نطلب كلمة مرور.</p>
    {error ? <div className="member-alert error" role="alert">{error}</div> : null}
    {challenge ? <div className="telegram-login-wait">
      <div className="telegram-status-dot" aria-hidden="true" />
      <p role="status" aria-live="polite">{status}</p>
      <a className="member-primary-button telegram-button" href={challenge.telegramUrl}>فتح Telegram</a>
      <button className="member-text-button" onClick={reset} type="button">إلغاء وطلب رابط جديد</button>
    </div> : <button className="member-primary-button telegram-button" disabled={busy} onClick={() => void begin()} type="button">
      {busy ? "نجهّز الرابط..." : "الدخول باستخدام Telegram"}
    </button>}
    <p className="member-privacy">هذا إصدار تجريبي. هويتك تجي فقط من Telegram، والصلاحيات تبقى عضو عادي.</p>
  </section>;
}
