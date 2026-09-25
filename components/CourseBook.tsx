import { getCourseBook } from "@/lib/course-materials";

export function CourseBook({ slug }: { slug: string }) {
  const book = getCourseBook(slug);
  if (!book) return null;
  return (
    <div className="notice">
      <div className="eyebrow">Included textbook</div>
      <p><strong>{book.title}</strong></p>
      <p>Read online or save the PDF for offline study alongside your lesson notes.</p>
      <p><small>Some books are large files. Google Drive may ask you to confirm the download because it cannot scan the file; download only if you trust this Institute-supplied material.</small></p>
      <div className="pillrow">
        <a className="btn quiet" href={book.viewUrl} target="_blank" rel="noopener noreferrer" aria-label={`Read ${book.title} (opens in a new tab)`}>Read book</a>
        <a className="btn primary" href={book.downloadUrl} target="_blank" rel="noopener noreferrer" aria-label={`Download ${book.title} as PDF`}>Download PDF</a>
      </div>
    </div>
  );
}
