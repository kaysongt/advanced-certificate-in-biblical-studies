import books from "../content/book-library.json";

type BookSource = { title: string; fileId: string; format: string };

/** Verified source files from the Institute's Bible School Materials folder. */
export function getCourseBook(slug: string) {
  if (!Object.hasOwn(books, slug)) return null;
  const book = (books as Record<string, BookSource>)[slug];
  if (!book) return null;
  const native = book.format === "google-doc";
  return {
    title: book.title,
    viewUrl: native
      ? `https://docs.google.com/document/d/${book.fileId}/preview`
      : `https://drive.google.com/file/d/${book.fileId}/view`,
    downloadUrl: native
      ? `https://docs.google.com/document/d/${book.fileId}/export?format=pdf`
      : `https://drive.google.com/uc?export=download&id=${book.fileId}`,
  };
}
