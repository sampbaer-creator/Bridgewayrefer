import Link from "next/link";
import { FAQS } from "./content";

export default function Close() {
  return (
    <>
      {/* ============ FAQ ============ */}
      <section className="bw-faq" id="faq">
        <div className="bw-section-head reveal">
          <p className="bw-eyebrow">Questions</p>
          <h2>
            Frequently asked<span className="bw-accent">.</span>
          </h2>
        </div>
        <div className="bw-faq-list">
          {FAQS.map(([question, answer]) => (
            <details className="reveal" key={question}>
              <summary>
                {question}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="bw-final-cta">
        <h2 className="reveal">
          Make the next referral <span className="bw-accent-light">impossible to lose.</span>
        </h2>
        <Link className="bw-btn bw-btn-light bw-btn-lg reveal" href="/signup?plan=workspace">
          Get started <span aria-hidden="true">→</span>
        </Link>
      </section>
    </>
  );
}
