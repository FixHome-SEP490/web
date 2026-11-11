/**
 * One request for calls made together. Calls in the same turn of the event loop as the request
 * that is starting share it (the layout and the socket both ask for the conversations when a page
 * opens). A call made later, while it is still running, may follow a change the server made after
 * it started, so it gets one fresh request once it ends; every such late call shares that one.
 */
export function coalesce<T>(run: () => Promise<T>): () => Promise<T> {
  let current: Promise<T> | null = null;
  let joinable = false;
  let next: Promise<T> | null = null;
  const call = (): Promise<T> => {
    if (current && joinable) return current;
    if (current) {
      next ??= current.then(() => undefined, () => undefined).then(() => {
        next = null;
        return call();
      });
      return next;
    }
    const started = run().finally(() => {
      if (current === started) current = null;
    });
    current = started;
    joinable = true;
    setTimeout(() => {
      joinable = false;
    }, 0);
    return started;
  };
  return call;
}
