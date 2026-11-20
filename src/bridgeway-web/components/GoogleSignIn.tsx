"use client";

import { useEffect, useState } from "react";

export default function GoogleSignIn({ signup = false, admin = false, outlined = false, plan }: { signup?: boolean; admin?: boolean; outlined?: boolean; plan?: "workspace" | "managed-calling" }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [liveHref, setLiveHref] = useState("");

  useEffect(() => {
    if (outlined && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) {
      const requestedPlan = plan ?? new URLSearchParams(window.location.search).get("plan");
      const url = new URL(signup ? "/signup" : "/staff/login?provider=google", "https://bridgewayrefer.com");
      if (signup && (requestedPlan === "workspace" || requestedPlan === "managed-calling")) url.searchParams.set("plan", requestedPlan);
      setLiveHref(url.toString());
    }
    const controller = new AbortController();
    fetch("/api/auth/providers", { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(providers => setAvailable(providers?.google === true))
      .catch(() => { if (!controller.signal.aborted) setAvailable(false); });
    return () => controller.abort();
  }, [outlined, signup, plan]);

  if (available === false && liveHref) {
    return <ProviderButton provider="google" signup={signup} plan={plan} hrefOverride={liveHref} />;
  }
  if (!available) return null;

  if (outlined) return <ProviderButton provider="google" signup={signup} plan={plan} />;

  return (
    <div>
      <a className="bw-btn bw-btn-secondary" href={admin ? "/staff/login?flow=admin&provider=google" : signup ? "/staff/login?flow=signup&provider=google" : "/staff/login?provider=google"}>
        Continue with Google
      </a>
    </div>
  );
}

export function ProviderButton({ provider, signup = false, plan, hrefOverride }: { provider: "microsoft" | "google"; signup?: boolean; plan?: "workspace" | "managed-calling"; hrefOverride?: string }) {
  const query = new URLSearchParams();
  if (signup) {
    query.set("flow", "signup");
    if (plan) query.set("plan", plan);
  }
  query.set("provider", provider);
  const href = hrefOverride ?? `/staff/login?${query}`;

  return (
    <a className="bw-auth-provider" href={href}>
      {provider === "microsoft" ? (
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
          <path fill="#F25022" d="M0 0h9.5v9.5H0z" />
          <path fill="#7FBA00" d="M10.5 0H20v9.5h-9.5z" />
          <path fill="#00A4EF" d="M0 10.5h9.5V20H0z" />
          <path fill="#FFB900" d="M10.5 10.5H20V20h-9.5z" />
        </svg>
      ) : (
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
          <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.7-.4-4H24v7.6h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.9-3.5 6.1-8.7 6.1-14.8z" />
          <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.7l-6.6-5c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20.4 20.4 0 0 0 24 44z" />
          <path fill="#FBBC05" d="M12.6 27.8a12.3 12.3 0 0 1 0-7.6V15H5.8a20 20 0 0 0 0 18z" />
          <path fill="#EA4335" d="M24 11.8c3 0 5.6 1 7.7 3l5.8-5.7A19.7 19.7 0 0 0 24 4 20.4 20.4 0 0 0 5.8 15l6.8 5.2c1.6-4.8 6.1-8.4 11.4-8.4z" />
        </svg>
      )}
      <span>{signup ? "Sign up" : "Sign in"} with {provider === "google" ? "Google" : "Microsoft"}</span>
    </a>
  );
}
