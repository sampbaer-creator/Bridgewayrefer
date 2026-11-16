import DemoRequestForm from "../../components/DemoRequestForm";

export const metadata = { title: "Contact", alternates: { canonical: "/contact" } };

export default function ContactPage() {
  return (
    <main className="bw-page" id="main-content">
      <section className="bw-section" aria-label="Contact BridgeWay">
        <div className="bw-contact-grid">
          <div className="bw-contact-copy">
            <p className="eyebrow">CONTACT</p>
            <h1>Talk to BridgeWay.</h1>
            <div className="bw-contact-points">
              <p>Book a walkthrough or ask a question. No sign-in or payment needed.</p>
              <p className="muted">For an existing referral, contact the receiving business.</p>
            </div>
          </div>
          <DemoRequestForm />
        </div>
      </section>
    </main>
  );
}
