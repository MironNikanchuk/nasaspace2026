"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useSession } from "./session";
import { Icon } from "./icon";

export function Account() {
  const auth = supabase;
  const { user, ready } = useSession();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return <>
    <div className="workspace-heading"><div><h1>Account</h1><p>Manage sign-in and where your scenarios are saved.</p></div></div>
    {!auth ? <section className="panel account-panel"><h2>Guest workspace</h2>
      <p>Guest comparisons are saved in this browser. Account sign-in is unavailable on this deployment.</p>
      <dl className="account-details">
        <div><dt>Time display</dt><dd>UTC</dd></div>
        <div><dt>Data cadence</dt><dd>30 minutes</dd></div>
        <div><dt>Scenario storage</dt><dd>This browser</dd></div>
      </dl>
      <Link className="button button-primary" href="/saved">View saved scenarios <Icon name="arrow-right" /></Link>
    </section> : !ready ? <p role="status" className="feedback">Checking session…</p> : user ?
      <section className="panel account-panel"><h2>Signed in</h2><p>{user.email}</p>
        <div className="action-row"><Link className="button button-primary" href="/saved">Saved scenarios</Link>
          <button className="button" disabled={busy} onClick={async () => {
            setBusy(true); setError("");
            try {
              const { error: issue } = await auth.auth.signOut();
              if (issue) setError(issue.message);
            } catch { setError("Could not sign out."); }
            finally { setBusy(false); }
          }}>Sign out</button></div>
      </section> :
      <section className="panel account-panel">
        <div className="segmented" aria-label="Account action">
          <button type="button" aria-pressed={mode === "sign-in"} onClick={() => { setMode("sign-in"); setError(""); setMessage(""); }}>Sign in</button>
          <button type="button" aria-pressed={mode === "sign-up"} onClick={() => { setMode("sign-up"); setError(""); setMessage(""); }}>Create account</button>
        </div>
        <form className="account-form" onSubmit={async (event) => {
          event.preventDefault(); setBusy(true); setError(""); setMessage("");
          const form = new FormData(event.currentTarget);
          const credentials = { email: String(form.get("email")), password: String(form.get("password")) };
          try {
            const response = mode === "sign-in"
              ? await auth.auth.signInWithPassword(credentials)
              : await auth.auth.signUp({ ...credentials, options: { emailRedirectTo: new URL("/account", window.location.origin).href } });
            if (response.error) setError(response.error.message);
            else if (mode === "sign-up" && !response.data.session) setMessage("Check your email to confirm your account.");
          } catch { setError("Could not reach the account service."); }
          finally { setBusy(false); }
        }}>
          <label className="field">Email<input name="email" type="email" required autoComplete="email" /></label>
          <label className="field">Password<input name="password" type="password" required minLength={mode === "sign-up" ? 8 : 1}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"} /></label>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Working…" : mode === "sign-in" ? "Sign in" : "Create account"}</button>
        </form>
        <Link className="text-link" href="/workspace">Continue as guest <Icon name="arrow-right" /></Link>
      </section>}
    {error && <p className="feedback error" role="alert">{error}</p>}
    {message && <p className="feedback" role="status">{message}</p>}
  </>;
}
