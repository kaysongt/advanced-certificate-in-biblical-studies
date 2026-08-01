import { fileStore } from "./file-store";
import { prismaStore } from "./prisma-store";
import type { DataStore } from "./types";

/**
 * ---------------------------------------------------------------------------
 * SWAP POINT — attaching the real database
 * ---------------------------------------------------------------------------
 *
 * 1. Create lib/db/<your-db>-store.ts exporting a `DataStore` implementation.
 * 2. Import it here and assign it to `store` below.
 * 3. Nothing else in the codebase changes — every caller depends on the
 *    interface in ./types.ts, not on the adapter.
 *
 * Suggested tables are documented in HANDOVER.md §4.4. Index at minimum:
 *   students(email) unique, enrollments(student_id), progress(student_id, lesson_id) unique
 */

const store: DataStore = process.env.DATABASE_URL ? prismaStore : fileStore;

export const db = store;
export const hasDurableStorage = Boolean(process.env.DATABASE_URL);
export type * from "./types";
