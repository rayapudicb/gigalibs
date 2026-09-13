export default function SignedOutPage() {
  return (
    <main className="centered-page">
      <section className="auth-card">
        <p className="eyebrow">GigaLibs AR</p>
        <h1>You are signed out</h1>
        <p>Your local AR session has been removed from this browser.</p>
        <a className="button primary" href="/auth/login">
          Sign in again
        </a>
      </section>
    </main>
  );
}
