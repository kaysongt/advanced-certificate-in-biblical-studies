-- Existing module conversations remain unchanged (lessonId is NULL).
ALTER TABLE "CommunityPost" ADD COLUMN "lessonId" TEXT;
CREATE INDEX "CommunityPost_moduleSlug_lessonId_createdAt_idx"
ON "CommunityPost"("moduleSlug", "lessonId", "createdAt");
