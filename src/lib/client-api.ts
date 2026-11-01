"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string> | unknown;
  requestId?: string;
}
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** Calls a ZoneFood API route and always resolves to a typed result (network failures become an error result). */
export async function callApi<T = unknown>(url: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { code: "NETWORK", message: "Could not reach the server. Check your connection and try again." } };
  }
}

/** Form-submission state: pending flag, a banner message and per-field messages from 422 responses. */
export function useSubmit<T = unknown>(opts: {
  url: string;
  method?: string;
  success?: string;
  onSuccess?: (data: T) => void;
  refresh?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const { url, method = "POST", success, onSuccess, refresh = true } = opts;

  const submit = useCallback(
    async (body?: unknown, urlOverride?: string) => {
      setPending(true);
      setError(null);
      setFields({});
      const result = await callApi<T>(urlOverride ?? url, method, body);
      setPending(false);
      if (result.ok) {
        if (success) toast.success(success);
        onSuccess?.(result.data);
        if (refresh) router.refresh();
        return result;
      }
      const details = result.error.details;
      if (details && typeof details === "object" && !Array.isArray(details)) setFields(details as Record<string, string>);
      setError(result.error.message);
      return result;
    },
    [url, method, success, onSuccess, refresh, router],
  );

  return { submit, pending, error, fields, clearError: () => { setError(null); setFields({}); } };
}

/** Reads a FormData into a plain object, with helpers for the types forms need. */
export const num = (v: FormDataEntryValue | null): number | undefined => (v === null || v === "" ? undefined : Number(v));
export const str = (v: FormDataEntryValue | null): string | undefined => (v === null || String(v).trim() === "" ? undefined : String(v).trim());
export const toIso = (v: FormDataEntryValue | null): string | undefined => (v ? new Date(String(v)).toISOString() : undefined);
