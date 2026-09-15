/** Prefer unseen questions; reuse only when a small bank cannot fill an attempt. */
export function prioritizeFreshQuestions<T extends { id: string }>(
  shuffled: T[],
  previousIds: string[],
  size: number,
): T[] {
  const previous = new Set(previousIds);
  return [
    ...shuffled.filter((question) => !previous.has(question.id)),
    ...shuffled.filter((question) => previous.has(question.id)),
  ].slice(0, size);
}
