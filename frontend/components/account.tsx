"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useSession } from "./session";
import { Icon } from "./icon";

export function Account() {
  const auth = supabase;
  const { user, ready } = useSession();
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "forgot" | "recovery">("sign-in");
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!auth) return;
    const { data } = auth.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("recovery");
    });
    return () => data.subscription.unsubscribe();
  }, [auth]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    const controller = new AbortController();
    void fetch(new URL("/auth/v1/settings", url), {
      headers: { apikey: key }, signal: controller.signal,
    }).then(async (response) => {
      if (response.ok) setGoogle((await response.json()).external?.google === true);
    }).catch(() => { /* Email sign-in remains available. */ });
    return () => controller.abort();
  }, []);

  function changeMode(next: typeof mode) {
    setMode(next);
    setError("");
    setMessage("");
  }
  return <div className="account-content">
    <div className="workspace-heading"><h1>Account</h1></div>
    {!auth ? <section className="panel account-panel"><h2>Guest workspace</h2>
      <p>Guest comparisons are saved in this browser.</p>
      <div className="action-row">
        <Link className="button button-primary" href="/workspace">Continue as guest <Icon name="arrow-right" /></Link>
        <Link className="button" href="/saved">Saved scenarios</Link>
      </div>
    </section> : !ready ? <p role="status" className="feedback">Checking session…</p> : user && mode !== "recovery" ?
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
        {mode === "recovery" ? <h2>Set a new password</h2> : <div className="segmented" aria-label="Account action">
          <button type="button" aria-pressed={mode === "sign-in"} disabled={busy} onClick={() => changeMode("sign-in")}>Sign in</button>
          <button type="button" aria-pressed={mode === "sign-up"} disabled={busy} onClick={() => changeMode("sign-up")}>Create account</button>
        </div>}
        {google && (mode === "sign-in" || mode === "sign-up") && <button className="button account-google" type="button" disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const { error: issue } = await auth.auth.signInWithOAuth({ provider: "google", options: {
                redirectTo: new URL("/account", window.location.origin).href,
              } });
              if (issue) setError(issue.message);
            } catch { setError("Could not start Google sign-in."); }
            finally { setBusy(false); }
          }}><img src="/media/google.svg" width={18} height={18} alt="" />Continue with Google</button>}
        {mode === "forgot" && <h2>Reset your password</h2>}
        <form className="account-form" key={mode} onSubmit={async (event) => {
          event.preventDefault(); setBusy(true); setError(""); setMessage("");
          const form = new FormData(event.currentTarget);
          const credentials = { email: String(form.get("email") ?? "").trim(), password: String(form.get("password") ?? "") };
          const returnTo = new URL("/account", window.location.origin).href;
          try {
            if (mode === "forgot") {
              const { error: issue } = await auth.auth.resetPasswordForEmail(credentials.email, { redirectTo: returnTo });
              if (issue) setError(issue.message);
              else setMessage("If an account exists, you’ll receive a password reset email.");
              return;
            }
            if (mode === "recovery") {
              const { error: issue } = await auth.auth.updateUser({ password: credentials.password });
              if (issue) setError(issue.message);
              else { changeMode("sign-in"); setMessage("Your password was updated."); }
              return;
            }
            const response = mode === "sign-in"
              ? await auth.auth.signInWithPassword(credentials)
              : await auth.auth.signUp({ ...credentials, options: { emailRedirectTo: returnTo } });
            if (response.error) setError(response.error.code === "email_address_not_authorized"
              ? "Email registration is temporarily unavailable. You can continue as a guest."
              : response.error.message);
            else if (mode === "sign-up" && !response.data.session) setMessage("Check your email to confirm your account.");
          } catch { setError("Could not reach the account service."); }
          finally { setBusy(false); }
        }}>
          {mode !== "recovery" && <label className="field">Email<input name="email" type="email" required autoComplete="email" /></label>}
          {mode !== "forgot" && <label className="field">{mode === "recovery" ? "New password" : "Password"}
            <input name="password" type="password" required minLength={mode === "sign-in" ? 1 : 8}
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"} /></label>}
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Working…"
            : { "sign-in": "Sign in", "sign-up": "Create account", forgot: "Send reset email", recovery: "Change password" }[mode]}</button>
        </form>
        {mode === "sign-in" && <button type="button" className="text-link account-link" disabled={busy} onClick={() => changeMode("forgot")}>Forgot password?</button>}
        <Link className="text-link" href="/workspace">Continue as guest <Icon name="arrow-right" /></Link>
      </section>}
    {error && <p className="feedback error" role="alert">{error}</p>}
    {message && <p className="feedback" role="status">{message}</p>}
  </div>;
}
