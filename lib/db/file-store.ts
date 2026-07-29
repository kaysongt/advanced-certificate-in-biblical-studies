import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { StorageUnavailableError } from "./types";
import type {
  DataStore,
  Enrollment,
  NewEnrollment,
  NewStudent,
  ProgressRecord,
  Student,
} from "./types";

/**
 * Development adapter — persists to a JSON file under .data/ (gitignored).
 *
 * This exists so the app runs end to end before the real database is attached.
 * It is NOT for production: it has no concurrency control, and serverless hosts
 * have a read-only filesystem. Replace it by implementing DataStore against the
 * real database and swapping the export in ./index.ts.
 */

type Shape = {
  students: Student[];
  enrollments: Enrollment[];
  progress: ProgressRecord[];
};

const FILE = path.join(process.cwd(), ".data", "store.json");
const EMPTY: Shape = { students: [], enrollments: [], progress: [] };

async function read(): Promise<Shape> {
  try {
    return { ...EMPTY, ...JSON.parse(await fs.readFile(FILE, "utf8")) };
  } catch {
    return { ...EMPTY };
  }
}

async function write(data: Shape): Promise<void> {
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    // Serverless hosts mount a read-only filesystem, so every write fails here.
    // Surface it as a known condition rather than an unhandled 500.
    throw new StorageUnavailableError(err);
  }
}

const normalize = (email: string) => email.trim().toLowerCase();

export const fileStore: DataStore = {
  async createStudent(input: NewStudent): Promise<Student> {
    const data = await read();
    const student: Student = {
      ...input,
      email: normalize(input.email),
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    data.students.push(student);
    await write(data);
    return student;
  },

  async getStudentByEmail(email: string): Promise<Student | null> {
    const data = await read();
    return data.students.find((s) => s.email === normalize(email)) ?? null;
  },

  async getStudentById(id: string): Promise<Student | null> {
    const data = await read();
    return data.students.find((s) => s.id === id) ?? null;
  },

  async createEnrollment(input: NewEnrollment): Promise<Enrollment> {
    const data = await read();
    const enrollment: Enrollment = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    data.enrollments.push(enrollment);
    await write(data);
    return enrollment;
  },

  async getEnrollmentsForStudent(studentId: string): Promise<Enrollment[]> {
    const data = await read();
    return data.enrollments.filter((e) => e.studentId === studentId);
  },

  async activateEnrollment(id: string, providerRef: string): Promise<Enrollment | null> {
    const data = await read();
    const found = data.enrollments.find((e) => e.id === id);
    if (!found) return null;
    found.status = "active";
    found.providerRef = providerRef;
    await write(data);
    return found;
  },

  async markLessonComplete(studentId: string, lessonId: string): Promise<void> {
    const data = await read();
    const exists = data.progress.some(
      (p) => p.studentId === studentId && p.lessonId === lessonId
    );
    if (!exists) {
      data.progress.push({ studentId, lessonId, completedAt: new Date().toISOString() });
      await write(data);
    }
  },

  async clearLessonComplete(studentId: string, lessonId: string): Promise<void> {
    const data = await read();
    const next = data.progress.filter(
      (p) => !(p.studentId === studentId && p.lessonId === lessonId)
    );
    if (next.length !== data.progress.length) {
      data.progress = next;
      await write(data);
    }
  },

  async getProgress(studentId: string): Promise<ProgressRecord[]> {
    const data = await read();
    return data.progress.filter((p) => p.studentId === studentId);
  },
};
