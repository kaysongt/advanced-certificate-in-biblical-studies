import { currentStudent, isStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { scholarshipCsv } from "@/lib/admin-export";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await currentStudent();
  if (!actor) return new Response("Sign in required", { status: 401 });
  if (!isStaff(actor))
    return new Response("Staff access required", { status: 403 });
  return new Response(scholarshipCsv(await db.listScholarshipApplications()), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="KTI-scholarship-applicants-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
