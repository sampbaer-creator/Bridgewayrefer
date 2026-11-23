"use client";

import { useState, type FormEvent } from "react";

export default function ReferralCalculator({ mode }: { mode: "roi" | "rate" }) {
  const [result, setResult] = useState("");
  const roi = mode === "roi";
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const total = Number(values.get("total"));
    const conversion = Number(values.get("conversion"));
    if (!roi && conversion > total) {
      setResult("Submitted referrals cannot exceed opens for this calculation. Check that both counts come from the same period and links.");
      return;
    }
    if (!roi) {
      setResult(`Submission rate: ${(conversion / total * 100).toFixed(1)}%.`);
      return;
    }
    const cost = Number(values.get("cost"));
    const value = total * (conversion / 100) * Number(values.get("value"));
    setResult(`Estimated net contribution: ${money.format(value - cost)}. ROI: ${((value - cost) / cost * 100).toFixed(1)}%.`);
  }
  return <>
    <p>{roi ? "Use the same time period for costs and referrals. Enter your estimated contribution after direct costs per booking. The result is an estimate." : "Use recorded opens and submitted referrals for the same links and dates. Opens may include repeat visits."}</p>
    <form className="bw-contact-form" onSubmit={calculate} onChange={() => setResult("")}>
      <label>{roi ? "Referral requests" : "Recorded card-link opens"}<input name="total" type="number" min={roi ? 0 : 1} step={1} required /></label>
      <label>{roi ? "Percentage that book" : "Submitted referrals"}<input name="conversion" type="number" min={0} max={roi ? 100 : undefined} step={roi ? "any" : 1} required /></label>
      {roi && <>
        <label>Contribution per booking ($)<input name="value" type="number" min={0} step="0.01" required /></label>
        <label>Referral program cost ($)<input name="cost" type="number" min="0.01" step="0.01" required /></label>
      </>}
      <button className="bw-btn bw-btn-primary">Calculate {roi ? "ROI" : "rate"}</button>
      <output aria-live="polite">{result}</output>
    </form>
  </>;
}
