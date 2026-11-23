import DemoRequestForm from "../../components/DemoRequestForm";

export const metadata = { title: "Book a Referral Tracking Demo", description: "Request a BridgeWay referral tracking demo and discuss your referral sources, follow-up workflow, and NFC card needs.", alternates: { canonical: "/contact" } };

export default function ContactPage() {
  return (
    <main className="bw-page" id="main-content">
      <section className="bw-section" aria-label="Contact BridgeWay">
        <div className="bw-contact-grid">
          <div className="bw-contact-copy">
            <p className="eyebrow">CONTACT</p>
            <h1>Book a referral tracking demo</h1>
            <div className="bw-contact-points">
              <p>Request a demo and get a custom referral breakdown for your business. We will email you to arrange a time.</p>
              <p className="muted">For an existing referral, contact the receiving business.</p>
            </div>
          </div>
          <DemoRequestForm />
        </div>
      </section>
    </main>
  );
}
