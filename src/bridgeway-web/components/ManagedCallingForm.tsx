"use client";

import { useState, type FormEvent } from "react";

export default function ManagedCallingForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [submissionId, setSubmissionId] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const id = submissionId || crypto.randomUUID();
    setSubmissionId(id);
    setStatus("sending");
    try {
      const response = await fetch("/api/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fields.get("name"),
          email: fields.get("email"),
          businessName: fields.get("businessName"),
          consent: fields.has("consent"),
          submissionId: id,
          interest: "managed-calling",
        }),
      });
      setStatus(response.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") return <p role="status">Thanks. We received your request about Managed Calling.</p>;

  return <form onSubmit={submit}>
    <label>Your name<input name="name" autoComplete="name" maxLength={120} required /></label>
    <label>Work email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
    <label>Business name<input name="businessName" autoComplete="organization" maxLength={120} required /></label>
    <label><input name="consent" type="checkbox" required /> Contact me about Managed Calling.</label>
    <button type="submit" disabled={status === "sending"}>{status === "sending" ? "Sending…" : "Request Managed Calling"}</button>
    {status === "error" && <p role="alert">Could not send your request. Please try again.</p>}
  </form>;
}
