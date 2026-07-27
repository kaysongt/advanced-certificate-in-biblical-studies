import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { currentStudent } from "@/lib/auth";
import { getModuleStatuses } from "@/lib/content";
import { getCurriculum } from "@/lib/curriculum";

import EnrolForm from "./EnrolForm";

export const metadata: Metadata = { title: "Enrol" };

export default async function EnrolPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  if (await currentStudent()) redirect("/dashboard");

  const { plan } = await searchParams;
  const initialPlan = plan === "certificate" ? "certificate" : "advanced";

  const { program } = getCurriculum();
  const modules = getModuleStatuses().map((s) => ({
    slug: s.module.slug,
    title: s.module.title,
    available: s.complete,
  }));
  const availableCount = modules.filter((m) => m.available).length;

  return (
    <main className="shell">
      <div className="authwrap">
        <div className="authcard">
          <h1>Enrol</h1>
          <p className="sub">
            Create your account for the {program.title}. {program.total_hours} hours across{" "}
            {program.total_certificates} certificates, self-paced.
          </p>

          <div className="notice warn">
            <strong>Payment is not connected yet.</strong> Your account and enrolment will be
            created and held as pending. You will be invoiced directly at{" "}
            <a href={`mailto:${program.contact.email}`}>{program.contact.email}</a> until
            checkout goes live.
          </div>

          {availableCount < program.total_certificates ? (
            <div className="notice">
              {availableCount} of {program.total_certificates} certificates are ready to study
              today. The rest unlock as they are released — enrol now and keep your place.
            </div>
          ) : null}

          <EnrolForm initialPlan={initialPlan} modules={modules} />
        </div>
      </div>
    </main>
  );
}
