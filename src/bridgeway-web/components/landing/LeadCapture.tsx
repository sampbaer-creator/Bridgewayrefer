"use client";

import { useRef, useState, type FormEvent } from "react";
import { api } from "../../lib/api";

type FormState = "idle" | "busy" | "done" | "error";

/* One id per page load: retries of the same request deduplicate server-side */
let submissionId = "";

async function sendDemoRequest(values: {
  name: string;
  email: string;
  businessName: string;
  consent: boolean;
  interest?: string;
}) {
  submissionId ||= crypto.randomUUID();
  await api("/api/demo-requests", {
    method: "POST",
    body: JSON.stringify({
      name: values.name,
      email: values.email,
      businessName: values.businessName,
      consent: values.consent,
      submissionId,
      ...(values.interest ? { interest: values.interest } : {}),
    }),
  });
}

export default function LeadCapture() {
  const [demoState, setDemoState] = useState<FormState>("idle");
  const [demoError, setDemoError] = useState("");
  const [listState, setListState] = useState<FormState>("idle");
  const [listError, setListError] = useState("");

  async function submitDemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setDemoState("busy");
    setDemoError("");
    try {
      await sendDemoRequest({
        name: String(values.get("name") || ""),
        email: String(values.get("email") || ""),
        businessName: String(values.get("businessName") || ""),
        consent: values.get("consent") === "on",
      });
      setDemoState("done");
    } catch (failure) {
      setDemoState("error");
      setDemoError(failure instanceof Error ? failure.message : "Could not send your request. Please try again.");
    }
  }

  async function submitChecklist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setListState("busy");
    setListError("");
    try {
      await sendDemoRequest({
        name: String(values.get("name") || ""),
        email: String(values.get("email") || ""),
        businessName: "Referral follow-up checklist request",
        consent: values.get("consent") === "on",
      });
      setListState("done");
    } catch (failure) {
      setListState("error");
      setListError(failure instanceof Error ? failure.message : "Could not send your request. Please try again.");
    }
  }

  return (
      <section className="bw-lead" id="walkthrough">
        <div className="bw-lead-card reveal">
          <div className="bw-lead-copy">
            <p className="bw-eyebrow bw-eyebrow-light">Questions?</p>
            <h2>
              Talk to us, or get our checklist<span className="bw-accent-light">.</span>
            </h2>
            <p className="bw-lead-sub">
              Book a 15-minute walkthrough, or get the follow-up checklist dental and trades teams use.
            </p>
          </div>
          <div className="bw-lead-forms">
            {demoState === "done" ? (
              <p className="bw-lead-success" role="status">
                Thanks. We&rsquo;ll email you within one business day.
              </p>
            ) : (
              <form className="bw-lead-form" onSubmit={submitDemo} noValidate>
                <label className="bw-sr-only" htmlFor="demo-name">
                  Your name
                </label>
                <input id="demo-name" name="name" type="text" placeholder="Your name" autoComplete="name" maxLength={120} required />
                <label className="bw-sr-only" htmlFor="demo-email">
                  Work email
                </label>
                <input id="demo-email" name="email" type="email" placeholder="Work email" autoComplete="email" maxLength={254} required />
                <label className="bw-sr-only" htmlFor="demo-business">
                  Practice or business
                </label>
                <input
                  id="demo-business"
                  name="businessName"
                  type="text"
                  placeholder="Practice or business"
                  autoComplete="organization"
                  maxLength={120}
                  required
                />
                <label className="bw-lead-consent">
                  <input name="consent" type="checkbox" required />
                  <span>I agree that BridgeWay may contact me about this request.</span>
                </label>
                <button className="bw-btn bw-btn-light bw-btn-block" type="submit" disabled={demoState === "busy"}>
                  {demoState === "busy" ? "Sending…" : "Book a walkthrough"} <span aria-hidden="true">→</span>
                </button>
                {demoState === "error" && (
                  <p className="bw-lead-error" role="alert">
                    {demoError}
                  </p>
                )}
                <p className="bw-lead-fine">We reply within one business day.</p>
              </form>
            )}
            {listState === "done" ? (
              <p className="bw-lead-success" role="status">
                Check your inbox for the checklist.
              </p>
            ) : (
              <form className="bw-lead-form" onSubmit={submitChecklist} noValidate>
                <label className="bw-sr-only" htmlFor="list-name">
                  Your name
                </label>
                <input id="list-name" name="name" type="text" placeholder="Your name" autoComplete="name" maxLength={120} required />
                <label className="bw-sr-only" htmlFor="list-email">
                  Email for the checklist
                </label>
                <input
                  id="list-email"
                  name="email"
                  type="email"
                  placeholder="Email me the checklist"
                  autoComplete="email"
                  maxLength={254}
                  required
                />
                <label className="bw-lead-consent">
                  <input name="consent" type="checkbox" required />
                  <span>One email with the checklist, nothing else.</span>
                </label>
                <button className="bw-btn bw-btn-ghost-light bw-btn-block" type="submit" disabled={listState === "busy"}>
                  {listState === "busy" ? "Sending…" : "Get the checklist"} <span aria-hidden="true">→</span>
                </button>
                {listState === "error" && (
                  <p className="bw-lead-error" role="alert">
                    {listError}
                  </p>
                )}
                <p className="bw-lead-fine">
                  Free. One email.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
  );
}
