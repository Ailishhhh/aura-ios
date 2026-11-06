import { useCallback, useEffect, useRef, useState } from "react";

export type Load<T> = { data: T | null; error: Error | null; loading: boolean; reload: () => void; refreshing: boolean; refresh: () => Promise<void> };

/** Runs [load] when [key] changes, keeping the last answer while a new one comes. */
export function useLoad<T>(key: string | null, load: (fresh: boolean) => Promise<T>): Load<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(key != null);
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const loader = useRef(load);
  loader.current = load;

  useEffect(() => {
    if (key == null) return;
    let live = true;
    setLoading(true);
    setError(null);
    loader
      .current(attempt > 0)
      .then((value) => live && setData(value))
      .catch((e) => live && setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [key, attempt]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await loader.current(true));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { data, error, loading, reload: () => setAttempt((a) => a + 1), refreshing, refresh };
}
