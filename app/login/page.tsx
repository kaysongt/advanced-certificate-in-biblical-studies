import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { currentStudent } from "@/lib/auth";

import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await currentStudent()) redirect("/dashboard");
  const requested = (await searchParams).next;
  const next = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";

  return (
    <main className="shell">
      <div className="authwrap">
        <div className="authcard">
          <h1>Sign in</h1>
          <p className="sub">Continue your studies where you left off.</p>
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
