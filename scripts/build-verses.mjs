#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAX = 140;

/** Mirrors QuranScroll TranslationManifest + Arabic + German. */
const EDITIONS = [
  { id: "ar.uthmani", language: "Arabic", languageCode: "ar", translator: "Uthmani", file: "ar-uthmani-simple.json" },
  { id: "en.saheeh", language: "English", languageCode: "en", translator: "Saheeh International", file: "en-sahih-international-simple.json" },
  { id: "en.haleem", language: "English", languageCode: "en", translator: "MAS Abdel Haleem", file: "en-haleem-simple.json" },
  { id: "en.bridges", language: "English", languageCode: "en", translator: "Bridges Translation", file: "bridges-translation-simple.json" },
  { id: "es.isa-garcia", language: "Spanish", languageCode: "es", translator: "Sheikh Isa Garcia", file: "es-isa-garcia-simple.json" },
  { id: "de.bubenheim", language: "German", languageCode: "de", translator: "Bubenheim & Elyas", file: "de-bubenheim-simple.json" },
  { id: "fr.rashid-maash", language: "French", languageCode: "fr", translator: "Rashid Maash", file: "fr-rashid-maash-simple.json" },
  { id: "ur.tafheem-maududi", language: "Urdu", languageCode: "ur", translator: "Tafheem e Qur'an - Maududi", file: "ur-al-maududi-simple.json" },
  { id: "ur.maududi-roman", language: "Urdu", languageCode: "ur", translator: "Abul Ala Maududi (Roman Urdu)", file: "maududi-roman-urdu-simple.json" },
  { id: "ur.tafsir-usmani", language: "Urdu", languageCode: "ur", translator: "Tafsir E Usmani", file: "tafsir-e-usmani-simple.json" },
  { id: "ur.bayan-ul-quran", language: "Urdu", languageCode: "ur", translator: "Bayan-ul-Quran", file: "bayan-ul-quran-simple.json" },
  { id: "id.indonesian", language: "Indonesian", languageCode: "id", translator: "Indonesian Islamic Affairs Ministry", file: "quran-id-simple.json" },
];

function parseQul(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") out[key] = value;
    else if (value && typeof value === "object" && typeof value.t === "string") out[key] = value.t;
  }
  return out;
}

function clean(text) {
  return text.replace(/^\uFEFF/, "").replace(/\s+/g, " ").trim();
}

/** English-only gate: keep complete standalone sentences, drop phrases/continuations. */
function isCompleteEnglishSentence(text) {
  const t = clean(text)
    .replace(/^[\[\(].*?[\]\)]\s*/, "") // leading editorial brackets
    .replace(/\s*[\[\(][^\]\)]*$/, "") // trailing incomplete bracket notes
    .trim();
  if (!t) return false;

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 6) return false;
  if (t.length > MAX) return false;

  // Must end like a finished sentence.
  if (!/[.!?…]["'”’)]*$/.test(t)) return false;
  // Trailing connectors / unfinished lists.
  if (/[,;:\-–—]\s*["'”’)]*$/.test(t)) return false;

  // Unclosed quotes or brackets.
  const quotes = (t.match(/"/g) || []).length;
  if (quotes % 2 !== 0) return false;
  if ((t.match(/\[/g) || []).length !== (t.match(/\]/g) || []).length) return false;

  // Muqatta'at / letter names only.
  if (/^(Alif|Lām|Lam|Meem|Mīm|Ṣād|Sad|Rā|Ra|Kāf|Kaf|Hā|Ha|Yā|Ya|ʿAyn|Ayn|Ṭā|Ta|Seen|Sīn|Sin|Nūn|Nun|Qāf|Qaf|Ḥā|Ha)([, ]+(Alif|Lām|Lam|Meem|Mīm|Ṣād|Sad|Rā|Ra|Kāf|Kaf|Hā|Ha|Yā|Ya|ʿAyn|Ayn|Ṭā|Ta|Seen|Sīn|Sin|Nūn|Nun|Qāf|Qaf|Ḥā|Ha))*\.?$/i.test(t)) {
    return false;
  }

  // Dependent openers / continuations that need prior context.
  if (/^(Who|Whom|Whose|Which|Where|Until|Unless|Although|Though|Because|Since|As if|As though)\b/i.test(t)) return false;
  if (/^(That they|That he|That she|That it|That you|That we|That He might|That they may|That you may|About what|In which|For which|Of which|With which|By which)\b/i.test(t)) return false;
  if (/^(Or |And that |So that |In order that |Lest |Namely |Such as )\b/i.test(t)) return false;
  // "When/While/If ..." only if the clause resolves (comma + continuation).
  if (/^(When|While|If)\b/i.test(t) && !/,.+/u.test(t)) return false;

  // Bare continuations / fragments common in translations.
  if (/^(Abiding|Remaining|Including|Except|Especially|Namely|Such as)\b/i.test(t)) return false;
  // Speech fragments that open or close mid-quote only.
  if (/^[\[\(]?["'“]/.test(t) && !/^[A-Z]/.test(t.replace(/^[\[\(]?["'“]\s*/, ""))) return false;

  // Needs a finite-ish verb signal so pure noun phrases drop out.
  const hasVerbSignal =
    /\b(is|are|was|were|be|been|being|am|do|does|did|have|has|had|will|would|shall|should|can|could|may|might|must|need|needs|say|says|said|tell|tells|told|know|knows|knew|see|sees|saw|come|comes|came|go|goes|went|give|gives|gave|make|makes|made|take|takes|took|create|created|creates|believe|believes|believed|worship|worships|forgive|forgives|guide|guides|guided|send|sends|sent|reveal|reveals|revealed|fear|fears|obey|obeys|remember|remembers|put|puts|support|supports|sufficient|decreed|prepared|remain|remains|return|returns|enter|enters|leave|leaves|hear|hears|call|calls|ask|asks|answer|answers|love|loves|hate|hates|wrong|wrongs|succeed|succeeds|fail|fails|knows?|sees?|hears?)\b/i.test(t) ||
    /\b(All[aā]h|God|Lord|He|She|They|We|You|I)\b.+/i.test(t);
  if (!hasVerbSignal) return false;

  return true;
}

const refs = [...readFileSync(join(root, "source/quotable-verses.md"), "utf8").matchAll(/^### (\d+:\d+)\s*$/gm)].map((m) => m[1]);
if (refs.length !== 5098) throw new Error(`Expected 5098 quotable refs, got ${refs.length}`);

// Gate all languages by English Saheeh sentence-ness so only complete thoughts remain.
const saheeh = parseQul(JSON.parse(readFileSync(join(root, "source/translations/en-sahih-international-simple.json"), "utf8")));
const sentenceRefs = refs.filter((ref) => isCompleteEnglishSentence(saheeh[ref] ?? ""));
const rejected = refs.length - sentenceRefs.length;
console.log(`sentence gate: kept ${sentenceRefs.length} / ${refs.length} (rejected ${rejected})`);

// Sample rejects for inspection.
const rejectSamples = [];
for (const ref of refs) {
  if (sentenceRefs.includes(ref)) continue;
  const text = clean(saheeh[ref] ?? "");
  if (!text || text.length > MAX) continue;
  rejectSamples.push(`Quran ${ref} — ${text}`);
  if (rejectSamples.length >= 25) break;
}
console.log("reject samples:");
for (const s of rejectSamples) console.log("  ", s);

const editionsOut = [];
const counts = {};

for (const edition of EDITIONS) {
  const path = join(root, "source/translations", edition.file);
  const map = parseQul(JSON.parse(readFileSync(path, "utf8")));
  const verses = [];
  for (const ref of sentenceRefs) {
    const text = clean(map[ref] ?? "");
    if (!text || text.length > MAX) continue;
    verses.push(`Quran ${ref} — ${text}`);
  }
  if (verses.length < 50) throw new Error(`${edition.id}: only ${verses.length} verses after filter`);
  editionsOut.push({
    id: edition.id,
    language: edition.language,
    languageCode: edition.languageCode,
    translator: edition.translator,
    verses,
  });
  counts[edition.id] = verses.length;
}

const outDir = join(root, "extensions/data");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "editions.json"), JSON.stringify({ defaultEditionId: "en.saheeh", editions: editionsOut }, null, 0));
writeFileSync(join(root, "source/sentence-refs.json"), JSON.stringify(sentenceRefs, null, 0));
console.log(JSON.stringify(counts, null, 2));
console.log("wrote", join(outDir, "editions.json"));
