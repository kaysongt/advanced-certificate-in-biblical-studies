import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { currentStudent } from "@/lib/auth";
import { isStaffOperationsPath, postLoginPath, safeReturnPath } from "@/lib/login-redirect";

import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const { next: requested, reset } = await searchParams;
  const next = safeReturnPath(requested);
  const student = await currentStudent();
  if (student) redirect(postLoginPath(student.role, next));
  const staffSignIn = isStaffOperationsPath(next);

  return (
    <main className="shell" id="main-content" tabIndex={-1}>
      <div className="authwrap">
        <div className="authcard">
          <h1>{staffSignIn ? "Staff sign in" : "Sign in"}</h1>
          <p className="sub">
            {staffSignIn
              ? "Use a Staff or Administrator account to continue to Staff Operations."
              : "Continue your studies where you left off."}
          </p>
          {reset === "success" ? <div className="notice good" role="status">Your password has been updated. Previous sessions have been signed out. Sign in with your new password.</div> : null}
          <LoginForm next={next} />
          {process.env.NODE_ENV !== "production" ? (
            <p className="formfoot">
              <a href="/dev-preview">Dev preview — skip sign-in</a>
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
