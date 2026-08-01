import { NextResponse } from "next/server";

import { currentStudent, isStaff } from "@/lib/auth";

/**
 * Minimal session probe for the client-side nav. Returns only whether
 * someone is signed in — never a name, email, or id. Marketing pages stay
 * statically prerenderable because nothing in their render tree reads
 * cookies(); only this route (and the genuinely gated /courses, /dashboard
 * pages, which need per-user data anyway) is dynamic.
 */
export async function GET() {
  const student = await currentStudent();
  return NextResponse.json(
    { signedIn: Boolean(student), staff: student ? isStaff(student) : false },
    { headers: { "Cache-Control": "no-store" } }
  );
}
