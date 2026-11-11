import { useEffect, useState } from "react";

// UI choices only; the v11 workspace remains the source of truth for decisions.
export function useWorkbenchState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { return JSON.parse(sessionStorage.getItem(`atlas-2.1:${key}`) ?? "null") ?? initial; }
    catch { return initial; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(`atlas-2.1:${key}`, JSON.stringify(value)); } catch { /* session may disallow storage */ }
  }, [key, value]);
  return [value, setValue] as const;
}
