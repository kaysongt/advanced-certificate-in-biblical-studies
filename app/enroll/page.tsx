import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { currentStudent } from "@/lib/auth";
import { getModuleStatuses } from "@/lib/content";
import { formatModuleReleaseDate, getCurriculum } from "@/lib/curriculum";
import { isStripeCheckoutConfigured } from "@/lib/payments/stripe-client";

import EnrollForm from "./EnrollForm";

export const metadata: Metadata = { title: "Enroll" };

export default async function EnrollPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; scholarship?: string }>;
}) {
  if (await currentStudent()) redirect("/dashboard");

  const { plan, scholarship } = await searchParams;

  const { program } = getCurriculum();
  const modules = getModuleStatuses().map((s) => ({
    slug: s.module.slug,
    title: s.module.title,
    available: s.available,
    availability: formatModuleReleaseDate(s.module),
  }));
  const availableCount = modules.filter((m) => m.available).length;
  const firstReleaseDate = modules[0].availability;
  const initialPlan = plan === "certificate" ? "certificate" : "advanced";
  const scholarshipIntent = scholarship === "apply";
  const stripeConfigured = isStripeCheckoutConfigured();

  return (
    <main className="shell">
      <div className="authwrap">
        <div className="authcard">
          <h1>Enroll</h1>
          <p className="sub">
            Create your account for the {program.title}. Choose a single certificate or reserve
            your place in the full program.
          </p>

          {scholarshipIntent ? (
            <div className="notice good">
              <strong>Your scholarship application starts here.</strong>{" "}
              Choose the program you want and create your account. You will continue directly to
              the private scholarship form before making any payment.
            </div>
          ) : null}

          <div className={stripeConfigured ? "notice good" : "notice warn"}>
            <strong>
              {stripeConfigured ? "Secure online payment follows registration." : "Direct payment instructions follow registration."}
            </strong>{" "}
            Your account and enrollment are created first, then held as pending until payment is
            securely confirmed. Bank transfer remains available. Questions can be sent to{" "}
            <a href={`mailto:${program.contact.email}`}>{program.contact.email}</a>.
          </div>

          {availableCount < program.total_certificates ? (
            <div className="notice">
              {availableCount > 0
                ? `${availableCount} of ${program.total_certificates} certificates are ready to study today. The rest unlock according to the published release schedule.`
                : `Enrollment is open now for individual certificates and the full program. The first certificate opens ${firstReleaseDate}, and each certificate unlocks on its published date.`}
            </div>
          ) : null}

          <EnrollForm
            initialPlan={initialPlan}
            modules={modules}
            scholarshipIntent={scholarshipIntent}
          />
        </div>
      </div>
    </main>
  );
}
