import Link from "next/link";
export default function NotFound() { return <main className="content"><div className="panel"><div className="empty"><h2>Not found</h2><p>This record does not exist or is outside your authorized scope.</p><Link className="button" href="/">Return to dashboard</Link></div></div></main>; }
