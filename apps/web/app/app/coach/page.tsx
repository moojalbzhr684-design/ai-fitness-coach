"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { memberApi, redirectForMemberAuth } from "@/lib/member-api";

interface ChatMessage { id: string; role: "USER" | "ASSISTANT"; content: string; createdAt: string }
interface Conversation { messages: ChatMessage[] }

export default function CoachPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { void memberApi<Conversation>("/api/v1/member/agent/conversation").then((data) => setMessages(data.messages)).catch((caught) => { if (!redirectForMemberAuth(caught)) setError(caught instanceof Error ? caught.message : "تعذر تحميل المحادثة"); }).finally(() => setLoading(false)); }, []);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [messages, sending]);
  async function send(event: FormEvent) {
    event.preventDefault();
    const text = message.trim(); if (!text || sending) return;
    const optimistic: ChatMessage = { id: `local-${Date.now()}`, role: "USER", content: text, createdAt: new Date().toISOString() };
    setMessages((items) => [...items, optimistic]); setMessage(""); setSending(true); setError(null);
    try {
      const result = await memberApi<{ message: string; createdAt: string }>("/api/v1/member/agent/message", { method: "POST", body: JSON.stringify({ message: text }) });
      setMessages((items) => [...items, { id: `assistant-${Date.now()}`, role: "ASSISTANT", content: result.message, createdAt: result.createdAt }]);
    } catch (caught) { if (!redirectForMemberAuth(caught)) setError(caught instanceof Error ? caught.message : "ما گدرت أوصل للمدرب هسه"); }
    finally { setSending(false); }
  }
  return <div className="member-page coach-page"><header className="member-page-header"><p className="member-kicker">المدرب الذكي</p><h1>احچي بطبيعتك</h1><p>الإجراءات تعتمد على أدوات المنصة وصلاحيات حسابك، مو على تخمينات.</p></header><section className="coach-window" aria-live="polite">{loading ? <div className="member-state">نحمّل المحادثة...</div> : null}{!loading && messages.length === 0 ? <div className="coach-empty"><strong>شلون أساعدك اليوم؟</strong><button onClick={() => setMessage("شنو تمريني اليوم؟")}>شنو تمريني اليوم؟</button><button onClick={() => setMessage("شلون تقدمي؟")}>شلون تقدمي؟</button><button onClick={() => setMessage("ما عندي دجاج، شنو البديل؟")}>بديل للدجاج</button></div> : messages.map((item) => <article className={`coach-message ${item.role === "USER" ? "user" : "assistant"}`} key={item.id}><span>{item.role === "USER" ? "إنت" : "المدرب"}</span><p>{item.content}</p></article>)}{sending ? <article className="coach-message assistant"><span>المدرب</span><p>أراجع بياناتك...</p></article> : null}<div ref={end} /></section>{error ? <div className="member-alert error">{error}</div> : null}<form className="coach-input" onSubmit={send}><textarea aria-label="رسالتك للمدرب" maxLength={4000} rows={2} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="مثلاً: ابدأ تمريني" /><button className="member-primary-button" disabled={sending || !message.trim()} type="submit">إرسال</button></form></div>;
}
