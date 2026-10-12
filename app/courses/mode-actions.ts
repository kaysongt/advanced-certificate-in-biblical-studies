"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentStudent } from "@/lib/auth";
import { canPreviewCourses } from "@/lib/course-preview";
import { LEARNING_MODE_COOKIE } from "@/lib/learning-mode";

export async function changeLearningMode(form: FormData): Promise<void> {
  const student = await currentStudent();
  if (!student || !canPreviewCourses(student)) return;
  const mode = form.get("mode");
  if (mode !== "study" && mode !== "preview") return;
  (await cookies()).set(LEARNING_MODE_COOKIE, student.id + ":" + mode, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/dashboard");
}
