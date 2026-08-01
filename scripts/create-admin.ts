import { StudentRole } from "@prisma/client";
import { z } from "zod";

import { hashPassword } from "../lib/auth-core";
import { prisma } from "../lib/db/prisma";

const input = z.object({
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(12),
  ADMIN_NAME: z.string().min(2).default("KingsWord Administrator"),
  ADMIN_COUNTRY: z.string().min(2).default("United States"),
}).parse(process.env);

const email = input.ADMIN_EMAIL.trim().toLowerCase();
const passwordHash = await hashPassword(input.ADMIN_PASSWORD);

await prisma.student.upsert({
  where: { email },
  update: {
    passwordHash,
    fullName: input.ADMIN_NAME,
    country: input.ADMIN_COUNTRY,
    role: StudentRole.ADMIN,
  },
  create: {
    email,
    passwordHash,
    fullName: input.ADMIN_NAME,
    country: input.ADMIN_COUNTRY,
    role: StudentRole.ADMIN,
  },
});

console.log(`Administrator ready: ${email}`);
await prisma.$disconnect();
