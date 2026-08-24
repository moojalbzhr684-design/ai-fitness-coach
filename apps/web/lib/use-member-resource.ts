"use client";

import { useCallback, useEffect, useState } from "react";
import { memberApi, redirectForMemberAuth } from "./member-api";

export function useMemberResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await memberApi<T>(path));
    } catch (caught) {
      if (!redirectForMemberAuth(caught)) setError(caught instanceof Error ? caught.message : "تعذر تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, loading, error, reload, setData };
}
