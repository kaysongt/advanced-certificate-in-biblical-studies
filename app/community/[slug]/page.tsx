import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import CommunityComposer from "@/components/CommunityComposer";
import { hasActiveAccess } from "@/lib/access";
import { currentStudent } from "@/lib/auth";
import { getCurriculum, getModule } from "@/lib/curriculum";
import { db } from "@/lib/db";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const module = getModule(slug);
  return module ? { title: `${module.short_title} community` } : {};
}

export default async function CommunityModulePage({ params }: Props) {
  const { slug } = await params;
  const module = getModule(slug);
  if (!module) notFound();

  const student = await currentStudent();
  if (!student) redirect(`/login?next=/community/${module.slug}`);

  const enrollments = await db.getEnrollmentsForStudent(student.id);
  if (!hasActiveAccess(enrollments, module.slug)) redirect("/enroll");

  const { program } = getCurriculum();
  const [posts, engagement] = await Promise.all([
    db.getCommunityPosts(module.slug),
    db.getCommunityEngagement(student.id),
  ]);
  const authors = await Promise.all(posts.map((post) => db.getStudentById(post.studentId)));
  const staffEmail = program.contact.email.toLowerCase();
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <main className="shell">
      <div className="community-shell">
        <div className="breadcrumb">
          <Link href="/community">Community</Link>
          <span className="sep">/</span>
          {module.short_title}
        </div>

        <header className="community-head">
          <div>
            <div className="eyebrow">Enrolled student community</div>
            <h1>{module.short_title} discussion</h1>
            <p className="deck">
              A thoughtful space for questions, feedback, and reflections from students and the
              KingsWord team. This is an asynchronous discussion group, not a live chat.
            </p>
          </div>
          <div className="engagement-tally" aria-label="Your community engagement">
            <strong>{engagement.credits}</strong>
            <span>engagement credits</span>
            <small>{engagement.posts} contributions recorded</small>
          </div>
        </header>

        <div className="community-guidance">
          <strong>Participation matters.</strong> Community activity is monitored as part of your
          learning record. Thoughtful contributions are eligible for instructor-awarded extra
          credit, but they never lower or replace the required 80% assessment pass mark.
        </div>

        <CommunityComposer moduleSlug={module.slug} />

        <section className="community-feed" aria-labelledby="community-feed-title">
          <div className="community-feed-head">
            <div>
              <div className="eyebrow">Module conversation</div>
              <h2 id="community-feed-title">Recent contributions</h2>
            </div>
            <span>{posts.length} {posts.length === 1 ? "post" : "posts"}</span>
          </div>

          {posts.length ? (
            <div className="community-posts">
              {posts.map((post, index) => {
                const author = authors[index];
                const isStaff = author?.email.toLowerCase() === staffEmail;
                return (
                  <article className="community-post" key={post.id}>
                    <div className="community-avatar" aria-hidden="true">
                      {(author?.fullName ?? "K").slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="community-post-meta">
                        <strong>{author?.fullName ?? "KingsWord student"}</strong>
                        <span className={isStaff ? "community-role staff" : "community-role"}>
                          {isStaff ? "KingsWord team" : "Student"}
                        </span>
                        <time dateTime={post.createdAt}>{dateFormatter.format(new Date(post.createdAt))}</time>
                      </div>
                      <p>{post.body}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="community-empty">
              <strong>Be the first to open the conversation.</strong>
              <p>Share a question from the module, a connection you noticed, or an encouraging response.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
