"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useSession } from "./session";
import { Icon } from "./icon";
import { useLanguage } from "./language";

export function Account({ initialMode = "sign-in" }: { initialMode?: "sign-in" | "sign-up" }) {
  const auth = supabase;
  const { t, language } = useLanguage();
  const { user, ready } = useSession();
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "forgot" | "recovery" | "password">(initialMode);
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
  const passwordOnly = mode === "recovery" || mode === "password";
  return <div className="account-content">
    <div className="workspace-heading"><h1>{t("Account")}</h1></div>
    {!auth ? <section className="panel account-panel"><h2>{t("Guest workspace")}</h2>
      <p>{t("Guest comparisons are saved in this browser.")}</p>
      <div className="action-row">
        <Link className="button button-primary" href="/workspace">{t("Continue as guest")} <Icon name="arrow-right" /></Link>
        <Link className="button" href="/saved">{t("Saved scenarios")}</Link>
      </div>
    </section> : !ready ? <p role="status" className="feedback">{t("Checking session…")}</p> : user && !passwordOnly ?
      <section className="panel account-panel"><h2>{t("Signed in")}</h2><p>{user.email}</p>
        <dl className="profile-details"><div><dt>{t("Registered")}</dt><dd>{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(user.created_at))}</dd></div></dl>
        <form className="account-form" key={user.id} onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setBusy(true); setError(""); setMessage("");
          try {
            const { error: issue } = await auth.auth.updateUser({ data: {
              moonsight_role: String(data.get("role")), moonsight_location: String(data.get("location")).trim(),
            } });
            if (issue) setError(issue.message);
            else setMessage("Profile saved.");
          } catch { setError("Could not reach the account service."); }
          finally { setBusy(false); }
        }}>
          <label className="field">{t("Role")}<select name="role" defaultValue={user.user_metadata.moonsight_role ?? ""}>
            <option value="">—</option>
            <option value="student">{t("Student")}</option><option value="scientist">{t("Scientist")}</option>
            <option value="educator">{t("Educator")}</option><option value="enthusiast">{t("Space enthusiast")}</option>
          </select></label>
          <label className="field">{t("Location")}<input name="location" autoComplete="address-level2" maxLength={100} defaultValue={user.user_metadata.moonsight_location ?? ""} /></label>
          <button className="button" type="submit" disabled={busy}>{t("Save profile")}</button>
        </form>
        <div className="action-row"><Link className="button button-primary" href="/saved">{t("Saved scenarios")}</Link>
          <button className="button" type="button" onClick={() => changeMode("password")} disabled={busy}>{t("Change password")}</button>
          <button className="button" disabled={busy} onClick={async () => {
            setBusy(true); setError("");
            try {
              const { error: issue } = await auth.auth.signOut();
              if (issue) setError(issue.message);
            } catch { setError("Could not sign out."); }
            finally { setBusy(false); }
          }}>{t("Sign out")}</button></div>
      </section> :
      <section className="panel account-panel">
        {passwordOnly ? <h2>{t("Set a new password")}</h2> : <div className="segmented" aria-label={t("Account action")}>
          <button type="button" aria-pressed={mode === "sign-in"} disabled={busy} onClick={() => changeMode("sign-in")}>{t("Sign in")}</button>
          <button type="button" aria-pressed={mode === "sign-up"} disabled={busy} onClick={() => changeMode("sign-up")}>{t("Create account")}</button>
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
          }}><img src="/media/google.svg" width={18} height={18} alt="" />{t("Continue with Google")}</button>}
        {mode === "forgot" && <h2>{t("Reset your password")}</h2>}
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
            if (passwordOnly) {
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
          {!passwordOnly && <label className="field">{t("Email")}<input name="email" type="email" required autoComplete="email" /></label>}
          {mode !== "forgot" && <label className="field">{t(passwordOnly ? "New password" : "Password")}
            <input name="password" type="password" required minLength={mode === "sign-in" ? 1 : 8}
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"} /></label>}
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? t("Working…")
            : t({ "sign-in": "Sign in", "sign-up": "Create account", forgot: "Send reset email", recovery: "Change password", password: "Change password" }[mode])}</button>
        </form>
        {mode === "sign-in" && <button type="button" className="text-link account-link" disabled={busy} onClick={() => changeMode("forgot")}>{t("Forgot password?")}</button>}
        {mode === "password" ? <button className="text-link account-link" type="button" onClick={() => changeMode("sign-in")}>{t("Cancel")}</button>
          : <Link className="text-link" href="/workspace">{t("Continue as guest")} <Icon name="arrow-right" /></Link>}
      </section>}
    {error && <p className="feedback error" role="alert">{t(error)}</p>}
    {message && <p className="feedback" role="status">{t(message)}</p>}
  </div>;
}
