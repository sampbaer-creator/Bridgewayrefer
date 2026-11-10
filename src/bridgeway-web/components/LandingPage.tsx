import Link from "next/link";

export default function LandingPage() {
  return <main className="access-page refreshed-home" id="main-content">
    <section className="home-hero"><div className="home-copy"><p className="eyebrow">REFERRALS, FOLLOWED THROUGH</p><h1>See where your referrals go.</h1><p>BridgeWay gives your business one private place to receive, follow up on, and close partner referrals.</p><div className="home-actions"><Link className="access-action" href="/signup">Set up your business <span aria-hidden="true">→</span></Link><a className="home-secondary" href="/staff/login">Sign in <span aria-hidden="true">→</span></a></div><small>$50 USD per business, per month · NFC cards sold separately</small></div>
      <div className="home-preview"><div className="preview-head"><span>YOUR REFERRALS</span><span>PRIVATE</span></div><h2>Referral follow-up</h2><div className="preview-row"><i/> <span><b>New referral</b><small>Ready for your next action</small></span><em>New</em></div><div className="preview-row muted-row"><i/> <span><b>Partner referral</b><small>Follow-up status visible</small></span><em>Contacted</em></div><footer>YOUR BUSINESS DATA ONLY</footer></div></section>
    <section className="home-steps"><article><span>01</span><h2>Connect once</h2><p>Sign in and complete one secure Stripe checkout.</p></article><article><span>02</span><h2>Stay signed in</h2><p>Your protected session keeps your business close at hand.</p></article><article><span>03</span><h2>Follow through</h2><p>See your referrals and their next steps in one place.</p></article></section>
  </main>;
}
