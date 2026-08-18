/**
 * Grant (or change) a role on an existing account, without touching the
 * password, name, country, or enrolments.
 *
 * This is deliberately not `admin:create`. That script upserts, so running it
 * against somebody who already has an account resets their password and
 * renames them. Promoting a real person needs to leave their login alone.
 *
 * Run with:
 *   ADMIN_EMAIL=person@example.com npm run admin:promote
 *
 * Optional: ROLE=admin | staff | student (defaults to admin), so the same
 * script can demote someone again.
 */

import { StudentRole } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../lib/db/prisma";

const input = z
  .object({
    ADMIN_EMAIL: z.string().email("Set ADMIN_EMAIL to the account's email address."),
    ROLE: z
      .enum(["admin", "staff", "student"])
      .default("admin")
      .transform((value) => value.toUpperCase() as keyof typeof StudentRole),
  })
  .safeParse(process.env);

if (!input.success) {
  console.error("Invalid configuration:");
  for (const issue of input.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

const email = input.data.ADMIN_EMAIL.trim().toLowerCase();
const role = StudentRole[input.data.ROLE];

const student = await prisma.student.findUnique({
  where: { email },
  select: { id: true, email: true, fullName: true, role: true },
});

if (!student) {
  console.error(`No account exists for ${email}.`);
  console.error(
    "Ask them to register on the site first, then run this again. Creating an\n" +
      "account here would mean inventing a password for someone else."
  );
  await prisma.$disconnect();
  process.exit(1);
}

if (student.role === role) {
  console.log(`${student.fullName} <${student.email}> is already ${role}. Nothing changed.`);
  await prisma.$disconnect();
  process.exit(0);
}

const previous = student.role;
await prisma.student.update({ where: { id: student.id }, data: { role } });

console.log(`${student.fullName} <${student.email}>`);
console.log(`  ${previous} -> ${role}`);
console.log("\nThey may need to sign out and back in for the new role to take effect.");
await prisma.$disconnect();
