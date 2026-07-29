import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { hashPassword, startSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { StorageUnavailableError } from "@/lib/db/types";

/**
 * Dev-only door into the student experience, skipping registration and
 * payment entirely.
 *
 *   /dev-preview                    -> signed in, dropped on the dashboard
 *   /dev-preview?to=/courses/st-101/1  -> signed in, dropped on that topic
 *
 * This route does not exist in production. `next build` runs with
 * NODE_ENV=production, which Vercel also sets at runtime, so the guard below
 * is not a toggle that can be left on by mistake — the route 404s the moment
 * it's built for production, full stop.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const requested = new URL(request.url).searchParams.get("to");
  // Only allow relative in-app paths — never redirect off-site from this route.
  const destination = requested && requested.startsWith("/") ? requested : "/dashboard";

  const email = "preview@kingsword.test";

  try {
    let student = await db.getStudentByEmail(email);
    if (!student) {
      student = await db.createStudent({
        fullName: "Preview Student",
        email,
        country: "Nigeria",
        passwordHash: await hashPassword(randomUUID()),
      });
      await db.createEnrollment({
        studentId: student.id,
        product: "advanced",
        plan: "advanced",
        status: "active",
        amount: 1000,
        currency: "USD",
        provider: "manual",
        providerRef: "dev-preview",
      });
    }
    await startSession(student.id);
  } catch (err) {
    if (err instanceof StorageUnavailableError) {
      return new NextResponse(
        "Preview storage is unavailable on this host (read-only filesystem). " +
          "This route only works with the local file-backed dev store.",
        { status: 503 }
      );
    }
    throw err;
  }

  redirect(destination);
}
