import { apiOrigin } from "../lib/api-origin";
import PatientForm from "./PatientForm";
import type { PublicConfig } from "../lib/api";
export default async function PublicPage(props: { code: string } | { businessId: string }) {
  const path = "businessId" in props
    ? "/api/public/businesses/" + encodeURIComponent(props.businessId) + "/patient-form"
    : "/api/public/cards/" + encodeURIComponent(props.code);
  const valid = "businessId" in props ? /^[A-Za-z0-9_-]{1,80}$/.test(props.businessId) : /^[A-Za-z0-9_-]{8,80}$/.test(props.code);
  const unavailable = <main className="bw-page bw-intake-unavailable" id="main-content"><section className="bw-access" aria-label="Referral form unavailable"><div className="bw-access-card"><p className="eyebrow">UNAVAILABLE</p><h1>Referral form unavailable</h1><p className="muted">This referral link is invalid or no longer accepting requests. Please contact the receiving business directly.</p><p><a href="/privacy">Privacy notice</a></p></div></section></main>;
  if (!valid) return unavailable;
  let response: Response | undefined;
  try { response = await fetch(new URL(path, apiOrigin()), { cache: "no-store", signal: AbortSignal.timeout(15000) }); } catch {}
  if (response?.status === 404) return unavailable;
  if (!response?.ok) return <main className="bw-page bw-intake-unavailable" id="main-content"><section className="bw-access" aria-label="Referral form unavailable"><div className="bw-access-card"><p className="eyebrow">UNAVAILABLE</p><h1>Referral form unavailable</h1><p className="muted">Our service is temporarily unavailable. Please try again shortly.</p><p><a href="/privacy">Privacy notice</a></p></div></section></main>;
  if ("businessId" in props) {
    const { form, code } = await response.json() as { form: PublicConfig; code: string };
    return <PatientForm config={form} code={code} />;
  }
  return <PatientForm config={await response.json() as PublicConfig} code={props.code} />;
}
