import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="access-page" id="main-content">
      <div className="access-intro">
        <p className="eyebrow">BRIDGEWAY</p>
        <h1>See where your referrals go.</h1>
        <p>Manage new referrals, follow up with customers, and see which cards and partners send them your way.</p>
      </div>
      <div className="access-options">
        <section className="card access-option">
          <h2>Open your dashboard</h2>
          <p>Sign in to your business workspace to manage referrals and see your results.</p>
          <a className="access-action" href="/staff/login">Sign in</a>
        </section>
        <section className="card access-option">
          <h2>Set up your business</h2>
          <p>$50 USD per business, per month. NFC cards are sold separately.</p>
          <Link className="access-action access-action-secondary" href="/signup">Sign up</Link>
        </section>
      </div>
    </main>
  );
}
