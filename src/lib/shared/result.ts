export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err(error: string, code?: string): Result<never> {
  return { ok: false, error, code };
}
