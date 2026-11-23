export const GTM_ID = "GTM-TSJS8XCM";
export const CONSENT_KEY = "bridgeway.analytics-consent";
export type Consent = "granted" | "denied";

/** Public marketing pages that may load Google Tag Manager. Everything else (dashboards, sign-in,
 *  signup, referral intake under /r and /p, admin, legal pages) is never tracked. */
const TRACKED = new Set(["/", "/how-it-works", "/pricing", "/contact", "/industries/dental", "/industries/trades", "/industries/healthcare"]);

export function isTrackedPath(pathname: string | null | undefined) {
  if (!pathname) return false;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return TRACKED.has(path);
}

export function readConsent(): Consent | null {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch { return null; }
}

/** Global Privacy Control is treated as a refusal, so no banner and no tags. */
export function browserOptedOut() {
  return typeof navigator !== "undefined" && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}
