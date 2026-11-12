import DemoRequestForm from "../../components/DemoRequestForm";

export const metadata = { title: "Contact and product walkthrough", alternates: { canonical: "/contact" } };

export default function ContactPage() {
  return (
    <main className="bw-page" id="main-content">
      <section className="bw-section" aria-label="Contact BridgeWay">
        <div className="bw-contact-grid">
          <div className="bw-contact-copy">
            <p className="eyebrow">TALK TO BRIDGEWAY</p>
            <h1>See how BridgeWay handles your referrals.</h1>
            <div className="bw-contact-points">
              <p>Request a walkthrough, ask about card pricing, or contact us about workspace access. No Microsoft sign-in or payment is needed to send this form.</p>
              <p className="muted">For an existing referral, contact the receiving business directly.</p>
            </div>
          </div>
          <DemoRequestForm />
        </div>
      </section>
    </main>
  );
}
