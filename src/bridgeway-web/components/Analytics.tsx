"use client";
import { GoogleTagManager } from "@next/third-parties/google";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CONSENT_KEY, GTM_ID, browserOptedOut, isTrackedPath, readConsent, type Consent } from "../lib/analytics";

type Layer = { dataLayer?: unknown[]; __bwGtmLoaded?: boolean };

/** Google Consent Mode v2: everything denied by default; analytics only after the visitor accepts. Ads stay denied. */
function pushConsent() {
  const w = window as unknown as Layer;
  w.dataLayer = w.dataLayer || [];
  // gtag() must push the arguments object, not an array.
  function gtag(..._args: unknown[]) { w.dataLayer!.push(arguments); }
  gtag("consent", "default", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied", wait_for_update: 500 });
  gtag("consent", "update", { analytics_storage: "granted" });
}

export default function Analytics() {
  const pathname = usePathname();
  const tracked = isTrackedPath(pathname);
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const banner = useRef<HTMLDivElement>(null);
  const settingsControl = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (consent === null && settingsControl.current) banner.current?.focus();
  }, [consent]);

  useEffect(() => { setConsent(browserOptedOut() ? "denied" : readConsent()); }, []);

  useEffect(() => {
    const reopen = (event: MouseEvent) => {
      const control = (event.target as Element | null)?.closest<HTMLElement>("[data-cookie-settings]");
      if (!control) return;
      event.preventDefault();
      settingsControl.current = control;
      if (banner.current) banner.current.focus();
      else setConsent(null);
    };
    document.addEventListener("click", reopen);
    return () => document.removeEventListener("click", reopen);
  }, []);

  // GTM cannot be unloaded once running. Leaving a tracked page for any other page becomes a full page
  // load, so tags never see dashboards, sign-in or referral forms.
  useEffect(() => {
    if (!loaded) return;
    const leave = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || isTrackedPath(url.pathname)) return;
      event.preventDefault();
      location.assign(url.href);
    };
    document.addEventListener("click", leave, true);
    return () => document.removeEventListener("click", leave, true);
  }, [loaded]);

  // Safety net for programmatic navigation away from a tracked page.
  useEffect(() => { if (loaded && !tracked) location.reload(); }, [loaded, tracked]);

  useEffect(() => {
    const w = window as unknown as Layer;
    if (tracked && consent === "granted" && !w.__bwGtmLoaded) { w.__bwGtmLoaded = true; pushConsent(); setLoaded(true); }
  }, [tracked, consent]);

  function choose(value: Consent) {
    try { localStorage.setItem(CONSENT_KEY, value); } catch { /* storage blocked: choice lasts for this page only */ }
    if (value === "denied" && loaded) { location.reload(); return; }
    setConsent(value);
    settingsControl.current?.focus();
    settingsControl.current = null;
  }

  return <>
    {loaded && <GoogleTagManager gtmId={GTM_ID} />}
    {tracked && consent === null && <div className="cookie-banner" ref={banner} tabIndex={-1} role="region" aria-label="Cookie choices">
      <p>We use optional analytics cookies on our marketing pages to learn which pages are useful. They are never used in dashboards or referral forms. <a href="/privacy">Privacy notice</a></p>
      <div className="cookie-banner-actions">
        <button type="button" onClick={() => choose("denied")}>Decline</button>
        <button type="button" className="cookie-accept" onClick={() => choose("granted")}>Accept analytics</button>
      </div>
    </div>}
  </>;
}
