import SignupForm from "../../components/SignupForm";

export const metadata = { title: "Sign up · Bridgewayrefer" };

export default function SignupPage() {
  return (
    <main className="signup-page" id="main-content">
      <section className="card signup-signin"><h2>Sign in to the office dashboard</h2><p className="eyebrow">STAFF ACCESS</p><a className="access-action" href="/staff/login">Continue with Microsoft (Entra)</a><p>Need access? Ask your workspace owner for an invite.</p></section>
      <section className="card signup-workspace"><h2>Create your workspace</h2><SignupForm /><p><a href="/pricing">Card costs and setup</a> · <a href="/contact">Request a walkthrough first</a></p><p className="signup-note">Choose the $50/month workspace or $400/month Managed Calling plan, which includes the workspace. Add your offices and partners, arrange card links, and test alerts before enabling intake. Cards are sold separately.</p></section>
    </main>
  );
}
