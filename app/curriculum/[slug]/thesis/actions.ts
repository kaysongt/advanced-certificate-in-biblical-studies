"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { currentStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { prisma } from "@/lib/db/prisma";
import { getModule, isModuleReleased } from "@/lib/curriculum";
import { hasStudyAccess } from "@/lib/access";
import { isCoursePreview } from "@/lib/learning-mode";

export async function submitThesis(form: FormData): Promise<{ message: string }> {
  const student = await currentStudent();
  if (!student || await isCoursePreview(student)) return { message: "Sign in and use study mode to submit your thesis." };
  const input = z.object({ rubricId: z.string().uuid(), body: z.string().trim().min(100).max(60000), confirm: z.literal("yes") }).safeParse(Object.fromEntries(form));
  if (!input.success) return { message: "Enter your thesis (100–60,000 characters) and confirm it is your own work." };
  const rubric = await prisma.thesisRubric.findUnique({ where: { id: input.data.rubricId } });
  const module = rubric && getModule(rubric.moduleSlug);
  if (!rubric?.approvedAt || !module || !isModuleReleased(module) || !hasStudyAccess(student, await db.getEnrollmentsForStudent(student.id), module.slug)) return { message: "This thesis is not available for your account." };
  // Idempotent: a retry never overwrites the original student's submission.
  const saved = await prisma.thesisSubmission.upsert({
    where: { studentId_rubricId: { studentId: student.id, rubricId: rubric.id } },
    create: { studentId: student.id, rubricId: rubric.id, body: input.data.body },
    update: {},
  });
  revalidatePath(`/curriculum/${module.slug}/thesis`);
  revalidatePath("/admin/thesis");
  return { message: saved.body === input.data.body ? "Thesis submitted. Your instructor will review it." : "A submission is already saved for this rubric. Contact KTI if it needs correction." };
}
