export default function SignIn() {
  return (
    <main className="bw-page" id="main-content">
      <section className="bw-access" aria-label="Staff sign in">
        <div className="bw-access-card">
          <p className="eyebrow">STAFF ACCESS</p>
          <h1>Sign in to the office dashboard</h1>
          <p className="muted">Need access? Ask your workspace owner for an invite.</p>
          <a className="bw-btn bw-btn-primary" href="/staff/login">Continue with Microsoft (Entra)</a>
        </div>
      </section>
    </main>
  );
}
