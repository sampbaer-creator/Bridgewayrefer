import SignupForm from "../../components/SignupForm";

export const metadata = { title: "Sign up | BridgeWay" };

export default function SignupPage() {
  return (
    <main className="bw-page" id="main-content">
      <section className="bw-signup-main" aria-label="Create your workspace">
        <div className="bw-section-head">
          <p className="eyebrow">GET STARTED</p>
          <h1>Create your workspace</h1>
          <p className="muted">Pick a plan, add your offices and partners, and test alerts before going live. NFC cards are included.</p>
        </div>
        <SignupForm />
        <p className="bw-form-note"><a href="/pricing">Pricing details</a> · <a href="/contact">Prefer a walkthrough first?</a></p>
      </section>
    </main>
  );
}
