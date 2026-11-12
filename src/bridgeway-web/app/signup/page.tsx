import SignupForm from "../../components/SignupForm";

export const metadata = { title: "Sign up · Bridgewayrefer" };

export default function SignupPage() {
  return (
    <main className="bw-page" id="main-content">
      <section className="bw-signup-main" aria-label="Create your workspace">
        <div className="bw-section-head">
          <p className="eyebrow">GET STARTED</p>
          <h1>Create your workspace</h1>
          <p className="muted">Choose the $50/month workspace or $400/month Managed Calling plan, which includes the workspace. Add your offices and partners, arrange card links, and test alerts before enabling intake. Cards are sold separately.</p>
        </div>
        <SignupForm />
        <p className="bw-form-note"><a href="/pricing">Card costs and setup</a> · <a href="/contact">Request a walkthrough first</a></p>
      </section>
    </main>
  );
}
