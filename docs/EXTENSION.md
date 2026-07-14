# Extension documentation

## Purpose

`pi-quran-verses` is a Pi coding-agent extension that replaces the working-message text next to Pi’s spinner with a random complete-sentence Quran verse while the agent is responding.

It is UI-only:

- does not inject messages into the model context
- does not register tools
- does not make network requests at runtime

## Entrypoint

`extensions/index.ts` exports a default factory:

```ts
export default function (pi: ExtensionAPI) { ... }
```

Pi loads it via the package manifest:

```json
{
  "pi": {
    "extensions": ["./extensions/index.ts"]
  }
}
```

## Runtime behavior

### On `session_start`

- Loads settings from `~/.pi/agent/pi-quran-verses.json`
- Sets a footer status like `Quran: English · Saheeh International`

### On `turn_start`

- Picks a random verse from the active edition
- Calls `ctx.ui.setWorkingMessage(verse)`

### Command `/quran-lang`

1. Prompt for language
2. If that language has multiple translations, prompt for translator
3. Persist `{ "editionId": "..." }` to settings
4. Update footer status and notify the user

## Data model

Bundled catalog: `extensions/data/editions.json`

```json
{
  "defaultEditionId": "en.saheeh",
  "editions": [
    {
      "id": "en.saheeh",
      "language": "English",
      "languageCode": "en",
      "translator": "Saheeh International",
      "verses": [
        "Quran 2:152 — ...",
        "Quran 94:5 — ..."
      ]
    }
  ]
}
```

User settings: `~/.pi/agent/pi-quran-verses.json`

```json
{
  "editionId": "en.haleem"
}
```

If settings are missing or point at an unknown edition, the extension falls back to `defaultEditionId`.

## Build pipeline

`scripts/build-verses.mjs` generates the runtime catalog.

Inputs:

- `source/quotable-verses.md` — complete-thought verse refs from the Quran wiki
- `source/translations/*.json` — per-edition text maps (`"1:1": { "t": "..." }`)

Steps:

1. Extract refs from `### surah:ayah` headings
2. Gate refs with the English Saheeh sentence filter
3. For each edition, keep refs with non-empty text ≤ 140 chars
4. Write:
   - `extensions/data/editions.json`
   - `source/sentence-refs.json`

Rebuild:

```bash
node scripts/build-verses.mjs
```

## Sentence quality rules

The English Saheeh International text is used as the gate for all languages so every edition shares the same complete-sentence ref set.

A candidate is kept only if it:

- has enough words (not a short fragment)
- ends with sentence punctuation (`.?!…`)
- does not end with unfinished connectors (`-`, `,`, `;`, `:`)
- has balanced quotes/brackets
- is not muqattaʿāt / letter-name only
- is not a dependent continuation opener needing prior context

This is intentionally conservative. Some valid short commands may be excluded if they look incomplete in English translation form.

## Language sources

Most non-Arabic translations come from the QuranScroll QUL simple JSON files:

- English: Saheeh, Haleem, Bridges
- Spanish: Isa Garcia
- French: Rashid Maash
- Urdu: Maududi, Roman Maududi, Tafsir E Usmani, Bayan-ul-Quran
- Indonesian: Ministry edition

Also included:

- Arabic Uthmani (from QuranScroll `quran-complete.json`)
- German Bubenheim & Elyas (from alquran.cloud, converted to the same simple JSON shape)

## Package publishing notes

`package.json` `files` includes only:

- `extensions/`
- `README.md`
- `LICENSE`

Build inputs under `source/` are local-only and not published.

Peer dependency:

```json
{
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*"
  }
}
```

## Manual verification

```bash
# package contents
npm pack --dry-run

# extension loads
pi -e . --list-models

# interactive check
pi -e .
# then send a prompt and confirm spinner verse text
# run /quran-lang and switch language
```

## Known limits

- Sentence filtering is English-heuristic based; some edge cases may still feel context-dependent.
- Spinner text is capped at 140 characters for terminal readability.
- Settings are global per user machine, not per project.
