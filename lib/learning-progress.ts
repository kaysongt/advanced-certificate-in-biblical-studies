/** Never round a score up into a pass (for example, 79.6% is still below 80%). */
export function meetsPassMark(correct: number, total: number, passMark: number): boolean {
  return total > 0 && correct >= 0 && correct <= total && correct * 100 >= passMark * total;
}

export function earlierLessonsComplete(
  rows: { id: string; n: number }[],
  topicNumber: number,
  done: ReadonlySet<string>,
): boolean {
  return rows.filter((row) => row.n < topicNumber).every((row) => done.has(row.id));
}
