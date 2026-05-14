// lib/types/action-result.ts
// Discriminated server-action result shape — see server-action-shape.md.

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
