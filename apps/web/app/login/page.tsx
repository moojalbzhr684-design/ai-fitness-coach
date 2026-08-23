import { redirect } from "next/navigation";
import { developmentLoginAction } from "@/app/actions";
import { getSessionActorUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSessionActorUserId()) redirect("/");
  const { error } = await searchParams;
  const production = process.env.NODE_ENV === "production";
  return <main className="login-page">
    <section className="login-visual"><div className="brand-mark"><div className="brand-badge">AF</div><div className="brand-copy"><strong>AI Fitness Coach</strong><span>Operations</span></div></div><div><p className="eyebrow">One platform · many gyms</p><h1>Coaching operations, without crossing tenant lines.</h1><p>Review progress, approvals, gym operations, and AI health through one secure service-backed interface.</p></div><p>Private by default. Audited when privileged.</p></section>
    <section className="login-form-wrap"><div className="login-card"><p className="eyebrow">Staff access</p><h2>Dashboard sign in</h2>{production ? <div className="banner error">Development login is disabled in production. Configure a production identity provider before launch.</div> : <><div className="dev-warning">Development-only bootstrap. The token maps to one server-configured Telegram-linked account; arbitrary user impersonation is not supported.</div>{error ? <div className="banner error">{error}</div> : null}<form action={developmentLoginAction} className="stack"><div className="field"><label htmlFor="token">Development access token</label><input id="token" name="token" type="password" autoComplete="current-password" required /></div><button className="button" type="submit">Open dashboard</button></form></>}</div></section>
  </main>;
}
