/** Preserve the operation's result type; timing out never produces a value.
 * This bounds waiting only. It cannot cancel an operation's external side effects.
 */
export async function beforeDeadline<T>(operation: () => T | PromiseLike<T>, deadline: number, message: string): Promise<T> {
  const remaining = deadline - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) throw new Error(message);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), remaining); })
    ]);
  } finally { clearTimeout(timer); }
}
