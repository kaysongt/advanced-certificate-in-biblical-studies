import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { StorageUnavailableError } from "./types";
import type {
  DataStore,
  Enrolment,
  NewEnrolment,
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
  enrolments: Enrolment[];
  progress: ProgressRecord[];
};

const FILE = path.join(process.cwd(), ".data", "store.json");
const EMPTY: Shape = { students: [], enrolments: [], progress: [] };

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

const normalise = (email: string) => email.trim().toLowerCase();

export const fileStore: DataStore = {
  async createStudent(input: NewStudent): Promise<Student> {
    const data = await read();
    const student: Student = {
      ...input,
      email: normalise(input.email),
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    data.students.push(student);
    await write(data);
    return student;
  },

  async getStudentByEmail(email: string): Promise<Student | null> {
    const data = await read();
    return data.students.find((s) => s.email === normalise(email)) ?? null;
  },

  async getStudentById(id: string): Promise<Student | null> {
    const data = await read();
    return data.students.find((s) => s.id === id) ?? null;
  },

  async createEnrolment(input: NewEnrolment): Promise<Enrolment> {
    const data = await read();
    const enrolment: Enrolment = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    data.enrolments.push(enrolment);
    await write(data);
    return enrolment;
  },

  async getEnrolmentsForStudent(studentId: string): Promise<Enrolment[]> {
    const data = await read();
    return data.enrolments.filter((e) => e.studentId === studentId);
  },

  async activateEnrolment(id: string, providerRef: string): Promise<Enrolment | null> {
    const data = await read();
    const found = data.enrolments.find((e) => e.id === id);
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
