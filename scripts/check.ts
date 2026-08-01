/**
 * Smoke checks for the content pipeline and storage layer.
 * Run with: npm run check
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { hashPassword, verifyPassword } from "../lib/auth-core";
import { hasActiveAccess } from "../lib/access";
import {
  getAssessmentBank,
  getCourseAudio,
  getCourseDoc,
  getCourseStatuses,
  getIndexes,
  getLesson,
  getLessonQuizQuestions,
  getLessonRows,
  getModuleDoc,
  getModuleStatuses,
} from "../lib/content";
import {
  findCourse,
  formatModuleReleaseDate,
  getCurriculum,
  isModuleReleased,
} from "../lib/curriculum";
import { isPrimaryRouteActive, PRIMARY_NAV_ITEMS } from "../lib/navigation";

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
  check("all assessments use the confirmed 80% pass mark", () =>
    assert.equal(curriculum.grading.pass_mark, 80)
  );
  check("module release schedule matches the confirmed launch dates", () =>
    assert.deepEqual(
      curriculum.modules.map((item) => [
        item.short_title,
        item.release_date,
        formatModuleReleaseDate(item),
      ]),
      [
        ["Systematic Theology", "2026-09-01", "September 1, 2026"],
        ["Biblical Foundations", "2026-11-01", "November 1, 2026"],
        ["Old Testament Survey", "2027-01-01", "January 1, 2027"],
        ["New Testament Survey", "2027-03-01", "March 1, 2027"],
        ["Spiritual Formation", "2027-05-01", "May 1, 2027"],
      ]
    )
  );
  check("Module I opens at midnight Chicago time on September 1", () => {
    assert.equal(isModuleReleased(curriculum.modules[0], new Date("2026-09-01T04:59:59Z")), false);
    assert.equal(isModuleReleased(curriculum.modules[0], new Date("2026-09-01T05:00:00Z")), true);
  });

  console.log("\nnavigation");
  check("primary tabs point to distinct routes", () =>
    assert.deepEqual(
      PRIMARY_NAV_ITEMS.map((item) => [item.label, item.href]),
      [
        ["Curriculum", "/curriculum"],
        ["Pricing", "/pricing"],
        ["Community", "/community"],
        ["Glossary", "/glossary"],
      ]
    )
  );
  check("community tab stays active on community groups", () =>
    assert.equal(isPrimaryRouteActive("/community/01-systematic-theology", "/community"), true)
  );
  check("community never activates the curriculum tab", () =>
    assert.equal(isPrimaryRouteActive("/community", "/curriculum"), false)
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
  check("rendered and server-graded quiz options use the same order", () => {
    const serverQuestions = getLessonQuizQuestions(module, course, 1);
    const renderedOptions = [...lesson.html.matchAll(/class="opt" data-correct="([01])"/g)].map(
      (match) => match[1] === "1"
    );
    assert.deepEqual(
      renderedOptions,
      serverQuestions.flatMap((question) => question.options.map((option) => option.correct))
    );
  });
  check("no raw directive markers leak through", () =>
    assert.ok(!lesson.html.includes(":::"), "found an unrendered ::: marker")
  );
  check("no block placeholders leak through", () =>
    assert.ok(!lesson.html.includes("KTIBLOCK"), "found an unreplaced KTIBLOCK")
  );
  const moduleDoc = getModuleDoc(module);
  check("student module page omits duplicate gain and instructor sections", () => {
    assert.ok(!moduleDoc.html.includes("What Students Gain"));
    assert.ok(!moduleDoc.html.includes("Instructor Notes"));
  });
  const courseDoc = getCourseDoc(module, course);
  check("student course page omits instructor notes", () =>
    assert.ok(!courseDoc.html.includes("Instructor Notes"))
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
  check("completed Module I content stays locked before its release date", () => {
    const prelaunch = getCourseStatuses(new Date("2026-08-31T12:00:00Z"));
    assert.equal(prelaunch.find((s) => s.course.slug === "st-101")!.available, false);
  });
  check("completed Module I content opens on its release date", () => {
    const launch = getModuleStatuses(new Date("2026-09-01T12:00:00Z"));
    assert.equal(launch.find((s) => s.module.slug === module.slug)!.available, true);
  });
  const assessmentBank = getAssessmentBank(module, course);
  check("st-101 has a deep randomized assessment bank", () =>
    assert.ok(assessmentBank.length >= 100, `${assessmentBank.length} questions`)
  );
  check("assessment questions have one correct option", () =>
    assert.ok(assessmentBank.every((question) => question.options.filter((option) => option.correct).length === 1))
  );
  const audio = getCourseAudio(course.slug);
  check("st-101 audiobook is mapped chapter by chapter", () =>
    assert.ok(audio && audio.tracks.length >= 10, `${audio?.tracks.length ?? 0} recordings`)
  );
  check("every Module I course can draw a different 20-question retake", () =>
    assert.ok(
      module.courses.every((item) => getAssessmentBank(module, item).length > 40),
      "a Module I assessment bank is too small"
    )
  );
  check("every Module I course has its supplied audiobook", () =>
    assert.ok(
      module.courses.every((item) => (getCourseAudio(item.slug)?.tracks.length ?? 0) >= 10),
      "a Module I audiobook is missing"
    )
  );

  console.log("\naccess control");
  const enrollmentBase = {
    id: "enrollment",
    studentId: "student",
    product: "advanced",
    plan: "advanced" as const,
    amount: 1000,
    currency: "USD",
    provider: null,
    providerRef: null,
    createdAt: new Date(0).toISOString(),
  };
  check("pending enrollment does not grant access", () =>
    assert.equal(hasActiveAccess([{ ...enrollmentBase, status: "pending" }], module.slug), false)
  );
  check("active advanced enrollment grants access", () =>
    assert.equal(hasActiveAccess([{ ...enrollmentBase, status: "active" }], module.slug), true)
  );
  check("active single-certificate enrollment is scoped", () =>
    assert.equal(
      hasActiveAccess(
        [{ ...enrollmentBase, product: module.slug, plan: "certificate", status: "active" }],
        module.slug
      ),
      true
    )
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
  const scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), "kti-check-"));
  const backup = path.join(scratchDir, "store.json.bak");
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
  const registered = await db.createStudentWithEnrollment(
    {
      fullName: "Test Student",
      email: "Test@Example.com",
      country: "Nigeria",
      passwordHash: hash,
    },
    {
      product: "advanced",
      plan: "advanced",
      status: "pending",
      amount: 1000,
      currency: "USD",
      provider: null,
      providerRef: null,
    }
  );
  const { student, enrollment } = registered;
  check("registration creates student and enrollment together", () =>
    assert.equal(enrollment.studentId, student.id)
  );
  check("student is created", () => assert.ok(student.id));
  check("email is normalized", () => assert.equal(student.email, "test@example.com"));
  check("public registration creates a student role", () => assert.equal(student.role, "student"));
  const byEmail = await db.getStudentByEmail("TEST@EXAMPLE.COM");
  check("lookup is case-insensitive", () => assert.equal(byEmail?.id, student.id));

  check("enrollment starts pending", () => assert.equal(enrollment.status, "pending"));
  const pendingEnrollments = await db.listPendingEnrollments();
  check("staff queue includes pending enrollment", () =>
    assert.equal(pendingEnrollments[0]?.student.email, student.email)
  );
  const activated = await db.activateEnrollment(enrollment.id, "test_ref_123");
  check("enrollment activates", () => assert.equal(activated?.status, "active"));

  await db.markLessonComplete(student.id, "st-101-1");
  await db.markLessonComplete(student.id, "st-101-1");
  const progress = await db.getProgress(student.id);
  check("progress is idempotent", () => assert.equal(progress.length, 1));

  await db.createQuizAttempt({
    studentId: student.id,
    courseSlug: "st-101",
    lessonId: "st-101-1",
    kind: "topic",
    correct: 4,
    total: 5,
    scorePct: 80,
    passed: true,
    answers: [0, 1, 2, 3, 0],
  });
  const hasPassingAttempt = await db.hasPassingTopicAttempt(student.id, "st-101-1");
  check("passing topic attempt is recorded server-side", () =>
    assert.equal(hasPassingAttempt, true)
  );

  const assessment = await db.createAssessmentSubmission({
    studentId: student.id,
    courseSlug: "st-101",
    sectionACorrect: 18,
    sectionATotal: 20,
    sectionAPoints: 36,
  });
  await db.submitAssessmentWrittenWork(
    assessment.id,
    student.id,
    "A complete set of clearly labelled written responses for instructor review."
  );
  const pendingAssessments = await db.listPendingAssessments();
  check("written assessment enters the staff grading queue", () =>
    assert.equal(pendingAssessments[0]?.id, assessment.id)
  );
  const grader = await db.createStudent({
    fullName: "Test Administrator",
    email: "admin@example.com",
    country: "United States",
    passwordHash: hash,
    role: "admin",
  });
  const graded = await db.gradeAssessment({
    id: assessment.id,
    graderId: grader.id,
    writtenPoints: 50,
    feedback: "Strong work.",
  });
  check("instructor grading calculates the final score", () =>
    assert.equal(graded?.totalScore, 86)
  );

  const communityPost = await db.createCommunityPost({
    moduleSlug: module.slug,
    studentId: student.id,
    body: "This is a thoughtful reflection on the first module lesson.",
  });
  check("community post starts without automatic extra credit", () =>
    assert.equal(communityPost.engagementCredits, 0)
  );
  const communityPosts = await db.getCommunityPosts(module.slug);
  check("community posts are scoped to the module", () =>
    assert.equal(communityPosts.length, 1)
  );
  await db.moderateCommunityPost({
    postId: communityPost.id,
    moderatorId: grader.id,
    hidden: false,
    engagementCredits: 2,
  });
  const engagement = await db.getCommunityEngagement(student.id);
  check("staff-awarded engagement credits are tracked separately", () =>
    assert.deepEqual(engagement, { posts: 1, credits: 2 })
  );

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
  await fs.rm(scratchDir, { recursive: true, force: true });

  console.log(`\n${passed} checks passed\n`);
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
