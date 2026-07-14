import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Edition = {
  id: string;
  language: string;
  languageCode: string;
  translator: string;
  verses: string[];
};

type Catalog = {
  defaultEditionId: string;
  editions: Edition[];
};

type Settings = {
  editionId: string;
};

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(packageDir, "extensions/data/editions.json");
const settingsPath = join(homedir(), ".pi/agent/pi-quran-verses.json");

const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as Catalog;

function loadSettings(): Settings {
  try {
    if (existsSync(settingsPath)) {
      const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as Partial<Settings>;
      if (parsed.editionId && catalog.editions.some((e) => e.id === parsed.editionId)) {
        return { editionId: parsed.editionId };
      }
    }
  } catch {
    // fall through
  }
  return { editionId: catalog.defaultEditionId };
}

function saveSettings(settings: Settings) {
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

function getEdition(editionId: string): Edition {
  return catalog.editions.find((e) => e.id === editionId) ?? catalog.editions[0]!;
}

function label(edition: Edition): string {
  return `${edition.language} · ${edition.translator}`;
}

function setVerse(ctx: ExtensionContext, edition: Edition) {
  const verse = edition.verses[Math.floor(Math.random() * edition.verses.length)]!;
  ctx.ui.setWorkingMessage(verse);
}

export default function (pi: ExtensionAPI) {
  let settings = loadSettings();

  pi.on("session_start", (_event, ctx) => {
    const edition = getEdition(settings.editionId);
    ctx.ui.setStatus("quran-verses", ctx.ui.theme.fg("dim", `Quran: ${label(edition)}`));
  });

  pi.on("turn_start", (_event, ctx) => {
    setVerse(ctx, getEdition(settings.editionId));
  });

  pi.registerCommand("quran-lang", {
    description: "Choose Quran language/translation for the working spinner",
    handler: async (_args, ctx) => {
      const languages = [...new Set(catalog.editions.map((e) => e.language))];
      const language = await ctx.ui.select("Language:", languages);
      if (!language) return;

      const editions = catalog.editions.filter((e) => e.language === language);
      let edition = editions[0]!;
      if (editions.length > 1) {
        const choice = await ctx.ui.select(
          "Translation:",
          editions.map((e) => e.translator),
        );
        if (!choice) return;
        edition = editions.find((e) => e.translator === choice) ?? edition;
      }

      settings = { editionId: edition.id };
      saveSettings(settings);
      ctx.ui.setStatus("quran-verses", ctx.ui.theme.fg("dim", `Quran: ${label(edition)}`));
      ctx.ui.notify(`Quran spinner: ${label(edition)}`, "info");
    },
  });
}
