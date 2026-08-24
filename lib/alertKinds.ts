import type { StringKey } from "./i18n";

/**
 * Alert `type` → its i18n label key. One definition: the bell and the command
 * centre render the same badge, and a detector that gains a new type must not
 * have to be remembered in two places (`duplicate` was missing from both, so
 * every duplicate-FIR alert read as the generic "ALERT").
 */
export const KIND_LABEL: Record<string, StringKey> = {
  spike: "alerts.kind.spike",
  repeat_suspect: "alerts.kind.repeat_suspect",
  weekly_surge: "alerts.kind.weekly_surge",
  forecast: "alerts.kind.forecast",
  mo_link: "alerts.kind.mo_link",
  duplicate: "alerts.kind.duplicate",
};
