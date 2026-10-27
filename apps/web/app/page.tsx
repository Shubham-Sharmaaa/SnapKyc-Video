import Link from "next/link";

export default function Home() {
  return (
    <main className="container">
      <section className="hero">
        <h1>SnapKYC Video</h1>
        <p className="muted">
          Video KYC proof of concept: consent, a live call with an agent, a
          second-person review, and a signed KYC token anyone can check.
        </p>
      </section>

      <div className="tiles">
        <Link href="/customer" className="card tile">
          <h2>I&apos;m a customer</h2>
          <p className="muted">
            Give consent and location, check your ID with SnapKYC (mock), then
            join a video call.
          </p>
          <span className="btn btn-primary">Start video KYC</span>
        </Link>
        <Link href="/login" className="card tile">
          <h2>Staff</h2>
          <p className="muted">
            Agents run calls and recommend. Reviewers watch the recording and
            approve or reject.
          </p>
          <span className="btn btn-ghost">Staff login</span>
        </Link>
        <Link href="/verify" className="card tile">
          <h2>Check a token</h2>
          <p className="muted">
            Paste a KYC token to see whether it is genuine and unexpired.
          </p>
          <span className="btn btn-ghost">Verify token</span>
        </Link>
      </div>
    </main>
  );
}
