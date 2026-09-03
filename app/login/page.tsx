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
  searchParams: Promise<{ next?: string }>;
}) {
  const requested = (await searchParams).next;
  const next = safeReturnPath(requested);
  const student = await currentStudent();
  if (student) redirect(postLoginPath(student.role, next));
  const staffSignIn = isStaffOperationsPath(next);

  return (
    <main className="shell">
      <div className="authwrap">
        <div className="authcard">
          <h1>{staffSignIn ? "Staff sign in" : "Sign in"}</h1>
          <p className="sub">
            {staffSignIn
              ? "Use a Staff or Administrator account to continue to Staff Operations."
              : "Continue your studies where you left off."}
          </p>
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
