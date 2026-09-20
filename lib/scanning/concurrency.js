export async function processWithConcurrency(items, worker, { concurrency, shouldContinue = () => true } = {}) {
  const pendingItems = [...items];
  const results = [];
  const errors = [];
  let scheduledCount = 0;

  async function runWorker() {
    while (pendingItems.length > 0) {
      if (!shouldContinue()) {
        return;
      }

      const item = pendingItems.shift();
      const scheduledIndex = scheduledCount;
      scheduledCount += 1;

      try {
        results.push(await worker(item, scheduledIndex));
      } catch (error) {
        errors.push({
          error,
          item,
          scheduledIndex,
        });
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, pendingItems.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  return {
    errors,
    remainingItems: pendingItems,
    results,
    scheduledCount,
  };
}