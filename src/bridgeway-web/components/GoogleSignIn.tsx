"use client";

import { useEffect, useState } from "react";

export default function GoogleSignIn({ signup = false }: { signup?: boolean }) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/providers", { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(providers => setAvailable(providers?.google === true))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (!available) return null;

  return (
    <div>
      <a className="bw-btn bw-btn-secondary" href={signup ? "/staff/login?flow=signup&provider=google" : "/staff/login?provider=google"}>
        Continue with Google
      </a>
    </div>
  );
}
