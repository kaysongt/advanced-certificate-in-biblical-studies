import { timingSafeEqual } from "node:crypto";

import { sendDuePaymentReminders } from "@/lib/reminders/send-payment-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(authorization: string | null, secret: string): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return Response.json({ error: "Payment reminders are not configured." }, { status: 503 });
  }
  if (!authorized(request.headers.get("authorization"), cronSecret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "Durable storage is not configured." }, { status: 503 });
  }

  try {
    const result = await sendDuePaymentReminders();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("Payment reminder run failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({ error: "Payment reminder delivery failed." }, { status: 500 });
  }
}
