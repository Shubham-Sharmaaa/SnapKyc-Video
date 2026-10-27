"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const DEMO_LOGINS = [
  { username: "agent1", role: "Agent" },
  { username: "reviewer1", role: "Reviewer" },
  { username: "lead1", role: "Agent + reviewer (shows maker-checker)" },
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Login failed");
      setBusy(false);
      return;
    }
    const roles: string[] = data.user.roles;
    router.push(roles.includes("agent") ? "/agent" : "/reviewer");
    router.refresh();
  }

  return (
    <main className="container narrow">
      <h1>Staff login</h1>
      <section className="card">
        <form onSubmit={submit} className="form">
          <label className="field">
            <span>Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" disabled={busy || !username || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
      <section className="card">
        <h2>Demo users</h2>
        <p className="muted small">
          Password for all: <code>demo1234</code>
        </p>
        <ul className="demo-users">
          {DEMO_LOGINS.map((u) => (
            <li key={u.username}>
              <button type="button" className="link" onClick={() => setUsername(u.username)}>
                {u.username}
              </button>{" "}
              — {u.role}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
