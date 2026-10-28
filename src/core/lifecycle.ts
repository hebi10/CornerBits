/** Tracks full mutations, including work that happens before a save enters the queue. */
export class PendingOperations {
  private pending = new Set<Promise<unknown>>();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const task = Promise.resolve().then(operation);
    this.pending.add(task);
    const finish = () => { this.pending.delete(task); };
    void task.then(finish, finish);
    return task;
  }

  async idle(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
}

// revision orders local saves, not a globally monotonic identity. Rollover keeps valid
// imported files usable; updatedAt records the actual save time.
export function nextRevision(...revisions: number[]): number {
  const current = Math.max(0, ...revisions);
  return current >= Number.MAX_SAFE_INTEGER ? 0 : current + 1;
}
