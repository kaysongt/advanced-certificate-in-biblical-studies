import { currentStudent, isStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCurriculum } from "@/lib/curriculum";
import { registrationsCsv } from "@/lib/admin-export";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  };
  const actor = await currentStudent();
  if (!actor) return new Response("Sign in required", { status: 401, headers });
  if (!isStaff(actor)) return new Response("Staff access required", { status: 403, headers });

  // Export the complete roster, independent of on-screen search, filters, or pagination.
  const [students, enrollments] = await Promise.all([db.listStudents(), db.listEnrollments()]);
  const names = new Map(getCurriculum().modules.map((module) => [module.slug, module.short_title]));
  names.set("advanced", "Advanced Certificate in Biblical Studies");
  return new Response(registrationsCsv(students, enrollments, names), {
    headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="KTI-all-registrations-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
