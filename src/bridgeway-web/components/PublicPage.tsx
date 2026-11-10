import { notFound } from "next/navigation";
import PatientForm from "./PatientForm";
import type { PublicConfig } from "../lib/api";
export default async function PublicPage({ code }: { code: string }) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(code)) notFound();
  let response: Response | undefined;
  try { response = await fetch(new URL("/api/public/cards/" + encodeURIComponent(code), process.env.BRIDGEWAYREFER_API_ORIGIN || process.env.BRIDGEWAY_API_ORIGIN || "http://127.0.0.1:5180"), { cache: "no-store", signal: AbortSignal.timeout(15000) }); } catch {}
  if (response?.status === 404) notFound();
  if (!response?.ok) return <main className="dashboard" id="main-content"><section className="card session-expired"><h1>Referral form unavailable</h1><p>Our service is temporarily unavailable. Please try again shortly.</p></section></main>;
  return <PatientForm config={await response.json() as PublicConfig} code={code} />;
}
