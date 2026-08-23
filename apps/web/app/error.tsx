"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="content"><div className="panel"><div className="empty"><h2>We couldn’t load this dashboard.</h2><p>The request was denied or a temporary server error occurred. No private details were exposed.</p><button className="button" onClick={reset}>Try again</button></div></div></main>;
}
