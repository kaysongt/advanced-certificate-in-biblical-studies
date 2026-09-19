import type { Metadata } from "next";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false, follow: false } };
export default function ForgotPasswordPage() {
  return <main className="shell" id="main-content" tabIndex={-1}><div className="authwrap"><div className="authcard">
    <div className="eyebrow">Account recovery</div>
    <h1>Forgot your password?</h1>
    <p className="sub">Enter the email address for your existing KTI account. We’ll email you a secure link to choose a new password. No need to sign up again.</p>
    <ForgotPasswordForm />
  </div></div></main>;
}
