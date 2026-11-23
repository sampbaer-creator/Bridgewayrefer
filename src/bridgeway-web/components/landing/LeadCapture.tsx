"use client";

import { useRef, useState, type FormEvent } from "react";
import { planCopy } from "../../lib/plan-copy";
import { api } from "../../lib/api";

type FormState = "idle" | "busy" | "done" | "error";

async function sendDemoRequest(values: {
  name: string;
  email: string;
  businessName: string;
  consent: boolean;
  submissionId: string;
  interest?: string;
  nfcCardQuantity?: number;
  notes?: string;
  phone?: string;
}) {
  await api("/api/demo-requests", {
    method: "POST",
    body: JSON.stringify(values),
  });
}

export default function LeadCapture({ signupPlan }: { signupPlan?: "workspace" | "managed-calling" } = {}) {
  const submissionId = useRef("");
  const [demoState, setDemoState] = useState<FormState>("idle");
  const [demoError, setDemoError] = useState("");

  async function submitDemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const quantity = values.get("nfcCardQuantity");
    setDemoState("busy");
    setDemoError("");
    try {
      submissionId.current ||= crypto.randomUUID();
      await sendDemoRequest({
        submissionId: submissionId.current,
        nfcCardQuantity: quantity ? Number(quantity) : undefined,
        notes: String(values.get("notes") || "").trim() || undefined,
        phone: String(values.get("phone") || "").trim() || undefined,
        interest: String(values.get("interest") || ""),
        name: signupPlan ? [values.get("firstName"), values.get("lastName")].map(part => String(part || "").trim()).join(" ") : String(values.get("name") || ""),
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

  return (
      <section className="bw-lead" id="walkthrough">
        <div className={signupPlan ? "bw-lead-card" : "bw-lead-card reveal"}>
          <div className="bw-lead-copy">
            {signupPlan ? <>
              <h1>Get started with BridgeWay</h1>
              <p className="bw-lead-sub">Tell us about your business and which plan interests you. We will follow up by email to discuss setup.</p>
              <p className="bw-lead-sub"><strong>{planCopy.workspace.name} from ${planCopy.workspace.fromUsd}/month</strong><br />Track referrals and manage follow-up with your team.</p>
              <p className="bw-lead-sub"><strong>{planCopy.managedCalling.name} from ${planCopy.managedCalling.fromUsd}/month</strong><br />BridgeWay helps follow up with your referrals by phone.</p>
              <p className="bw-lead-sub"><strong>Custom plan</strong><br />Ask about pricing for your locations and card needs.</p>
              <p className="bw-lead-sub"><a href="/pricing">Compare plans and card details</a></p>
            </> : <>
            <p className="bw-eyebrow bw-eyebrow-light">Questions?</p>
            <h2>
              Talk to us, or get our checklist<span className="bw-accent-light">.</span>
            </h2>
            <p className="bw-lead-sub">
              Request a 15-minute demo, or get the follow-up checklist healthcare and trades teams use.
            </p>
            </>}
          </div>
          <div className="bw-lead-forms">
            {demoState === "done" ? (
              <p className="bw-lead-success" role="status">
                Thanks. We&rsquo;ll email you within one business day.
              </p>
            ) : (
              <form className="bw-lead-form" onSubmit={submitDemo}>
                {signupPlan ? <div className="bw-demo-name">
                  <label>First name<input name="firstName" autoComplete="given-name" maxLength={59} required /></label>
                  <label>Last name<input name="lastName" autoComplete="family-name" maxLength={60} required /></label>
                </div> : <>
                <label className="bw-sr-only" htmlFor="demo-name">
                  Your name
                </label>
                <input id="demo-name" name="name" type="text" placeholder="Your name" autoComplete="name" maxLength={120} required />
                </>}
                <label className={signupPlan ? undefined : "bw-sr-only"} htmlFor="demo-email">
                  Work email
                </label>
                <input id="demo-email" name="email" type="email" placeholder="Work email" autoComplete="email" maxLength={254} required />
                <label className={signupPlan ? undefined : "bw-sr-only"} htmlFor="demo-business">
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
                {signupPlan && <>
                  <label>Phone number (optional)<input name="phone" type="tel" autoComplete="tel" maxLength={40} /></label>
                  <fieldset className="bw-demo-plans">
                    <legend>Which plan interests you?</legend>
                    <label><input type="radio" name="interest" value="workspace" defaultChecked={signupPlan === "workspace"} required /> <span>Referral Workspace <strong>${planCopy.workspace.fromUsd}/month and up</strong></span></label>
                    <label><input type="radio" name="interest" value="managed-calling" defaultChecked={signupPlan === "managed-calling"} /> <span>Managed Calling <strong>${planCopy.managedCalling.fromUsd}/month and up</strong></span></label>
                    <label><input type="radio" name="interest" value="custom" /> <span>Custom plan <strong>Request a quote</strong></span></label>
                  </fieldset>
                  <label>How many NFC cards would you like? (optional)<input name="nfcCardQuantity" type="number" min={1} max={100000} step={1} placeholder="For example, 25" /></label>
                  <label>Tell us what you need (optional)<textarea name="notes" rows={3} maxLength={1000} placeholder="Locations, card needs, or questions for the demo" /></label>
                </>}
                <label className="bw-lead-consent">
                  <input name="consent" type="checkbox" required />
                  <span>I agree that BridgeWay may contact me about this request.</span>
                </label>
                <button className="bw-btn bw-btn-light bw-btn-block" type="submit" disabled={demoState === "busy"}>
                  {demoState === "busy" ? "Sending…" : signupPlan ? "Book a demo" : "Book a demo"} <span aria-hidden="true">→</span>
                </button>
                {demoState === "error" && (
                  <p className="bw-lead-error" role="alert">
                    {demoError}
                  </p>
                )}
                <p className="bw-lead-fine">We reply within one business day.</p>
              </form>
            )}
            {!signupPlan && <details className="bw-lead-form">
              <summary className="bw-btn bw-btn-ghost-light">View the follow-up checklist</summary>
              <ol>
                <li>Confirm the referral reached the right office.</li>
                <li>Assign a staff member and set a follow-up deadline.</li>
                <li>Contact the person using their preferred contact details.</li>
                <li>Record the outcome and set the next action or close the referral.</li>
              </ol>
            </details>}
          </div>
        </div>
      </section>
  );
}

