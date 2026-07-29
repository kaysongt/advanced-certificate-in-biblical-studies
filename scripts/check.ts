/**
 * Smoke checks for the content pipeline and storage layer.
 * Run with: npm run check
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { hashPassword, verifyPassword } from "../lib/auth-core";
import { getCourseStatuses, getIndexes, getLesson, getLessonRows } from "../lib/content";
import { getCurriculum, findCourse } from "../lib/curriculum";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

async function main() {
  console.log("\ncurriculum");
  const curriculum = getCurriculum();
  check("five modules load", () => assert.equal(curriculum.modules.length, 5));
  check("32 courses total", () =>
    assert.equal(
      curriculum.modules.reduce((n, m) => n + m.courses.length, 0),
      curriculum.program.total_courses
    )
  );

  console.log("\ncontent rendering");
  const found = findCourse("st-101");
  assert.ok(found, "st-101 should exist");
  const { module, course } = found;

  const rows = getLessonRows(module, course);
  check("st-101 has six lessons", () => assert.equal(rows.length, 6));
  check("lesson ids match the legacy format", () => assert.equal(rows[0].id, "st-101-1"));
  check("module I lesson titles are written", () =>
    assert.ok(!rows[0].title.startsWith("Lesson "), `got "${rows[0].title}"`)
  );

  const lesson = getLesson(module, course, 1);
  check("lesson renders html", () => assert.ok(lesson.html.length > 2000));
  check("objectives directive renders", () =>
    assert.match(lesson.html, /<div class="objectives">/)
  );
  check("scripture directive renders", () =>
    assert.match(lesson.html, /<div class="scripture">/)
  );
  check("terms directive renders", () => assert.match(lesson.html, /<dl class="terms">/));
  check("quiz directive renders", () => assert.match(lesson.html, /<section class="quiz"/));
  check("quiz marks a correct answer", () =>
    assert.match(lesson.html, /data-correct="1"/)
  );
  check("no raw directive markers leak through", () =>
    assert.ok(!lesson.html.includes(":::"), "found an unrendered ::: marker")
  );
  check("no block placeholders leak through", () =>
    assert.ok(!lesson.html.includes("KTIBLOCK"), "found an unreplaced KTIBLOCK")
  );

  console.log("\nindexes");
  const { terms, scriptures } = getIndexes();
  check("glossary collects terms", () => assert.ok(terms.length > 100, `${terms.length}`));
  // Module I is the only written module: 36 lessons, roughly one keyed
  // :::scripture block each.
  check("scripture index collects refs", () =>
    assert.ok(scriptures.length >= 30, `only ${scriptures.length} refs`)
  );

  console.log("\ncourse status");
  const statuses = getCourseStatuses();
  const st101 = statuses.find((s) => s.course.slug === "st-101")!;
  check("st-101 reports complete", () => assert.equal(st101.complete, true));
  check("a module II course reports incomplete", () =>
    assert.equal(statuses.find((s) => s.course.slug === "bf-201")!.complete, false)
  );

  console.log("\npasswords");
  const hash = await hashPassword("correct horse battery staple");
  check("hash is scrypt format", () => assert.match(hash, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/));
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  passed += 1;
  console.log("  ok  correct password verifies");
  assert.equal(await verifyPassword("wrong password", hash), false);
  passed += 1;
  console.log("  ok  wrong password rejected");

  console.log("\nstorage");
  // Exercise the dev adapter against a scratch file, then clean up.
  const dataDir = path.join(process.cwd(), ".data");
  const backup = path.join(dataDir, "store.json.bak");
  const live = path.join(dataDir, "store.json");
  let hadExisting = false;
  try {
    await fs.copyFile(live, backup);
    hadExisting = true;
  } catch {
    /* nothing to preserve */
  }
  await fs.rm(live, { force: true });

  const { db } = await import("../lib/db");
  const student = await db.createStudent({
    fullName: "Test Student",
    email: "Test@Example.com",
    country: "Nigeria",
    passwordHash: hash,
  });
  check("student is created", () => assert.ok(student.id));
  check("email is normalized", () => assert.equal(student.email, "test@example.com"));
  const byEmail = await db.getStudentByEmail("TEST@EXAMPLE.COM");
  check("lookup is case-insensitive", () => assert.equal(byEmail?.id, student.id));

  const enrollment = await db.createEnrollment({
    studentId: student.id,
    product: "advanced",
    plan: "advanced",
    status: "pending",
    amount: 1000,
    currency: "USD",
    provider: null,
    providerRef: null,
  });
  check("enrollment starts pending", () => assert.equal(enrollment.status, "pending"));
  const activated = await db.activateEnrollment(enrollment.id, "test_ref_123");
  check("enrollment activates", () => assert.equal(activated?.status, "active"));

  await db.markLessonComplete(student.id, "st-101-1");
  await db.markLessonComplete(student.id, "st-101-1");
  const progress = await db.getProgress(student.id);
  check("progress is idempotent", () => assert.equal(progress.length, 1));

  await fs.rm(live, { force: true });

  // Serverless hosts have a read-only filesystem. Simulate that by putting a
  // FILE where the .data directory must be, so mkdir fails, and confirm the
  // store reports it as a known condition rather than an opaque crash.
  console.log("\nread-only filesystem handling");
  await fs.rm(dataDir, { recursive: true, force: true });
  await fs.writeFile(dataDir, "blocked", "utf8");
  const { StorageUnavailableError } = await import("../lib/db/types");
  let caught: unknown = null;
  try {
    await db.createStudent({
      fullName: "Blocked",
      email: "blocked@example.com",
      country: "Nigeria",
      passwordHash: hash,
    });
  } catch (err) {
    caught = err;
  }
  await fs.rm(dataDir, { force: true });
  check("write failure raises StorageUnavailableError", () =>
    assert.ok(caught instanceof StorageUnavailableError, `got ${caught}`)
  );

  if (hadExisting) {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.rename(backup, live);
  }

  console.log(`\n${passed} checks passed\n`);
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
