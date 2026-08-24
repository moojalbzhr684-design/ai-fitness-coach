import { notFound, redirect } from "next/navigation";
import { developmentLoginAction } from "@/app/actions";
import { getSessionActorUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function StaffLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  if (await getSessionActorUserId()) redirect("/");
  const { error } = await searchParams;
  return <main className="login-page">
    <section className="login-visual"><div className="brand-mark"><div className="brand-badge">AF</div><div className="brand-copy"><strong>AI Fitness Coach</strong><span>Operations</span></div></div><div><p className="eyebrow">Local development only</p><h1>Staff workspace</h1><p>This route does not exist in production.</p></div></section>
    <section className="login-form-wrap"><div className="login-card"><p className="eyebrow">Staff access</p><h2>Development sign in</h2><div className="dev-warning">This local bootstrap maps to one server-configured Telegram account. It cannot choose a user or role.</div>{error ? <div className="banner error">{error}</div> : null}<form action={developmentLoginAction} className="stack"><div className="field"><label htmlFor="token">Development access token</label><input id="token" name="token" type="password" autoComplete="current-password" required /></div><button className="button" type="submit">Open dashboard</button></form></div></section>
  </main>;
}
