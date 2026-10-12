CREATE TABLE "ThesisRubric" (
  "id" TEXT NOT NULL, "moduleSlug" TEXT NOT NULL, "title" TEXT NOT NULL,
  "instructions" TEXT NOT NULL, "criteria" JSONB NOT NULL, "createdById" TEXT NOT NULL,
  "approvedById" TEXT, "approvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ThesisRubric_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ThesisRubric_moduleSlug_createdAt_idx" ON "ThesisRubric"("moduleSlug", "createdAt");
CREATE TABLE "ThesisSubmission" (
  "id" TEXT NOT NULL, "studentId" TEXT NOT NULL, "rubricId" TEXT NOT NULL, "body" TEXT NOT NULL,
  "aiSuggestion" JSONB, "aiModel" TEXT, "aiReviewedAt" TIMESTAMP(3),
  "finalScore" INTEGER, "feedback" TEXT, "gradedById" TEXT, "gradedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ThesisSubmission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ThesisSubmission_score_check" CHECK ("finalScore" IS NULL OR "finalScore" BETWEEN 0 AND 100),
  CONSTRAINT "ThesisSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ThesisSubmission_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "ThesisRubric"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ThesisSubmission_studentId_rubricId_key" ON "ThesisSubmission"("studentId", "rubricId");
CREATE INDEX "ThesisSubmission_createdAt_idx" ON "ThesisSubmission"("createdAt");
