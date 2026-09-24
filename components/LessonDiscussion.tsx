import Link from "next/link";
import { db } from "@/lib/db";
import { isStaff } from "@/lib/auth";
import CommunityComposer from "./CommunityComposer";

/** Render only inside the lesson page, after its authentication and access checks. */
export default async function LessonDiscussion({ moduleSlug, lessonId, title }: {
  moduleSlug: string; lessonId: string; title: string;
}) {
  const posts = await db.getCommunityPosts(moduleSlug, lessonId);
  const authors = new Map(await Promise.all([...new Set(posts.map((post) => post.studentId))]
    .map(async (id) => [id, await db.getStudentById(id)] as const)));
  const dates = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/Chicago" });
  return <section className="lesson-discussion" id="discussion" aria-labelledby="lesson-discussion-title">
    <div className="eyebrow">Reflect together</div>
    <h2 id="lesson-discussion-title">Discuss this lesson</h2>
    <p>Lesson focus: <strong>{title}</strong></p>
    <p>Share a question, a Scripture connection, or a practical application with your classmates and instructors.</p>
    <p className="hint">Participation is optional and does not block the next lesson. This is an asynchronous group, not live chat. Be respectful; do not share private information or assessment answers.</p>
    <CommunityComposer moduleSlug={moduleSlug} lessonId={lessonId} />
    <div className="community-feed">
      <h3>Lesson conversation</h3>
      <p className="hint">The latest 50 contributions are shown. Reload this page to check for new responses.</p>
      {posts.length ? <div className="community-posts">{posts.map((post) => {
        const author = authors.get(post.studentId);
        return <article className="community-post" key={post.id}>
          <div className="community-avatar" aria-hidden="true">{(author?.fullName ?? "K").slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="community-post-meta">
              <strong>{author?.fullName ?? "KTI student"}</strong>
              {author && isStaff(author) ? <span className="community-role staff">KingsWord team</span> : null}
              <time dateTime={post.createdAt}>{dates.format(new Date(post.createdAt))}</time>
            </div>
            <p>{post.body}</p>
          </div>
        </article>;
      })}</div> : <div className="community-empty">No contributions yet. Start the conversation for this lesson.</div>}
    </div>
    <Link href={`/community/${moduleSlug}`}>Go to the general module discussion →</Link>
  </section>;
}
