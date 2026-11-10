import SignupForm from "../../components/SignupForm";

export const metadata = { title: "Sign up · BridgeWay" };

export default function SignupPage() {
  return (
    <main className="signup-page" id="main-content">
      <section className="card signup-signin"><h2>Sign in to the office dashboard</h2><p className="eyebrow">STAFF ACCESS</p><a className="access-action" href="/staff/login">Continue with Microsoft (Entra)</a><p>Need access? Ask your workspace owner for an invite.</p></section>
      <section className="card signup-workspace"><h2>Create your workspace</h2><SignupForm /><p className="signup-note">$50/mo. Referral intake starts closed until you turn it on.</p></section>
    </main>
  );
}
