import GoogleSignIn from "../../components/GoogleSignIn";

export default function SignIn() {
  return (
    <main className="bw-page" id="main-content">
      <section className="bw-access" aria-label="Staff sign in">
        <div className="bw-access-card">
          <img className="bw-access-logo" src="/brand-logo.png" alt="BridgeWayRefer" width={116} height={40} />
          <p className="eyebrow">STAFF ACCESS</p>
          <h1>Sign in to the office dashboard</h1>
          <p className="muted">Need access? Ask your workspace owner for an invite.</p>
          <a className="bw-btn bw-btn-primary" href="/staff/login">Continue with Microsoft</a>
          <GoogleSignIn />
        </div>
      </section>
    </main>
  );
}
