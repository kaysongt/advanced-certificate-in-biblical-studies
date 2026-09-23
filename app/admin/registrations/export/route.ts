import { currentStudent, isStaff } from "@/lib/auth";
import { loadRegistrationReport } from "@/lib/registration-report";
import { registrationGroup } from "@/lib/registration-groups";
import { getCurriculum } from "@/lib/curriculum";
import { registrationsCsv } from "@/lib/admin-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  };
  const actor = await currentStudent();
  if (!actor) return new Response("Sign in required", { status: 401, headers });
  if (!isStaff(actor)) return new Response("Staff access required", { status: 403, headers });

  const requestedGroup = new URL(request.url).searchParams.get("group");
  const group = registrationGroup(requestedGroup);
  if (requestedGroup && !group) return new Response("Unknown registration group", { status: 400, headers });
  // Group exports include every person in the group, not just the current page/search.
  const { students, enrollments, evidence } = await loadRegistrationReport();
  const selected = group ? students.filter((student) => evidence.get(student.id)?.group === group) : students;
  const names = new Map(getCurriculum().modules.map((module) => [module.slug, module.short_title]));
  names.set("advanced", "Advanced Certificate in Biblical Studies");
  return new Response(registrationsCsv(selected, enrollments, names, evidence), {
    headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="KTI-${group ?? "all"}-registrations-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
