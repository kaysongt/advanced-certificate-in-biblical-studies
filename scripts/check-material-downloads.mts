import assert from "node:assert/strict";
import { getCurriculum } from "../lib/curriculum";
import { getCourseBook } from "../lib/course-materials";

// Explicit network check; not part of offline unit tests. No credentials used.
for (const module of getCurriculum().modules) {
  await Promise.all(module.courses.map(async (course) => {
    const book = getCourseBook(course.slug);
    assert.ok(book, `${course.slug}: missing book`);
    const response = await fetch(book.downloadUrl, { method: "HEAD", signal: AbortSignal.timeout(30000) });
    const type = response.headers.get("content-type") ?? "";
    const disposition = response.headers.get("content-disposition") ?? "";
    assert.ok(response.ok, `${course.slug}: HTTP ${response.status}`);
    if (type.includes("text/html")) {
      const page = await fetch(book.downloadUrl, { signal: AbortSignal.timeout(30000) });
      const html = await page.text();
      assert.ok(page.ok && html.includes('id="download-form"') && html.includes("Virus scan warning"), `${course.slug}: unexpected interstitial / access denied`);
      console.log(`${course.code}: public download available; Google requires large-file confirmation`);
      return;
    }
    assert.ok(type.includes("application/pdf") || (type.includes("application/octet-stream") && /\.pdf/i.test(disposition)), `${course.slug}: not a downloadable PDF (${type})`);
    assert.match(disposition, /attachment/i, `${course.slug}: missing download disposition`);
    console.log(`${course.code}: public PDF download OK`);
  }));
}
