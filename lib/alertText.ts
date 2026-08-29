import { STRINGS, tf, tv, type Params, type StringKey } from "./i18n";
import type { Lang } from "@/store/chat";

/**
 * Detector findings, rendered in the reader's language.
 *
 * The detectors used to concatenate English sentences and store them. That
 * made the finding untranslatable after the fact: "21% jump last month (34 vs
 * 28...)" cannot be turned into Kannada without re-deriving the numbers, and
 * Kannada does not put them in the same order anyway. So a detector now emits
 * a `type` and the values behind it, and the sentence is built here — at read
 * time, in whichever language the officer has selected.
 *
 * `title`/`detail` remain on the row as the English rendering: alert rows
 * written before this change have no params, and the PDF export and the
 * notification text still read them.
 */

/** Param keys whose values are reference-table entries, not free text. A
 *  district or crime group stored as "Kolar" must render as "ಕೋಲಾರ". */
const VALUE_PARAMS = new Set(["district", "matchDistrict", "crime", "crimeGroup", "status"]);

/**
 * Two conventions, both resolved here:
 *  - a param named in VALUE_PARAMS is a reference-table value, so it goes
 *    through the value map;
 *  - a param with a `Kn` twin (`why` / `whyKn`) was rendered in both languages
 *    by the detector, because rebuilding it needs data the row does not carry.
 *    The twin wins in Kannada and is dropped from the English render.
 */
function localiseParams(params: Params, lang: Lang): Params {
  const out: Params = {};
  for (const [k, v] of Object.entries(params)) {
    if (k.endsWith("Kn")) continue;
    const twin = params[`${k}Kn`];
    if (lang === "kn" && twin !== undefined) out[k] = twin;
    else if (lang === "kn" && VALUE_PARAMS.has(k) && typeof v === "string") out[k] = tv(v, lang);
    else out[k] = v;
  }
  return out;
}

/** A detector type with no template yet falls back to the stored English
 *  rather than rendering a literal "finding.foo.title". */
function key(name: string): StringKey | null {
  return name in STRINGS ? (name as StringKey) : null;
}

/** The `detail` template a finding uses. Duplicates come in two variants: the
 *  far district's copy has the shared person's name stripped out. */
function detailKey(type: string, params: Params): StringKey | null {
  if (type === "duplicate" && params.unnamed) return "finding.duplicate.detailUnnamed";
  return key(`finding.${type}.detail`);
}

export type Finding = {
  kind?: string;
  type?: string;
  title: string;
  detail: string;
  params?: Params | null;
};

/**
 * Returns the finding's title and detail in `lang`. Falls back to the stored
 * English whenever the row predates params or the detector has no template —
 * an untranslated sentence beats a blank card.
 */
export function renderFinding(f: Finding, lang: Lang): { title: string; detail: string } {
  const type = f.kind ?? f.type ?? "";
  const params = f.params;
  if (!params) return { title: f.title, detail: f.detail };

  const p = localiseParams(params, lang);
  const tKey = key(`finding.${type}.title`);
  const dKey = detailKey(type, params);

  return {
    title: tKey ? tf(tKey, lang, p) : f.title,
    detail: dKey ? tf(dKey, lang, p) : f.detail,
  };
}

/**
 * The English rendering a detector stores in `title`/`detail`. Derived from the
 * same templates as the Kannada, so the stored sentence and the displayed one
 * cannot drift — there is only ever one wording per finding type.
 */
export function english(type: string, params: Params): { title: string; detail: string } {
  return renderFinding({ type, title: "", detail: "", params }, "en");
}
