export const metadata = { title: "Sign in", description: "Sign in to your BridgeWay referral tracking workspace." };

import GoogleSignIn, { ProviderButton } from "../../components/GoogleSignIn";

export default function SignIn() {
  return (
    <main className="bw-page bw-sign-in" id="main-content">
      <section className="bw-access" aria-label="Staff sign in">
        <div className="bw-access-card">
          <p className="eyebrow">STAFF ACCESS</p>
          <h1>Sign in to BridgeWay Refer</h1>
          <p className="muted">Need access? Ask your workspace owner for an invite.</p>
          <div className="bw-auth-providers">
            <ProviderButton provider="microsoft" />
            <GoogleSignIn outlined />
          </div>
        </div>
      </section>
    </main>
  );
}
