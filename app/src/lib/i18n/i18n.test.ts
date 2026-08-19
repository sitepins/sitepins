import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import languages from "@/config/languages.json";
import { getDirection } from "@/lib/i18n/direction";
import { namespaces } from "@/lib/i18n/namespaces";
import { routing } from "@/lib/i18n/routing";
import {
  getMenuTranslations,
  locales as utilLocales,
  resolveLocalizedText,
} from "@/lib/utils/localized-text";

const I18N_DIR = path.resolve(__dirname, "../../i18n");
const EN_DIR = path.join(I18N_DIR, "en");

const localeDirectories = readdirSync(I18N_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

const enFiles = readdirSync(EN_DIR).filter((file) => file.endsWith(".json"));

function getAllKeyEntries(
  obj: Record<string, unknown>,
  prefix = "",
): Array<{ path: string; value: unknown }> {
  let entries: Array<{ path: string; value: unknown }> = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      entries = entries.concat(
        getAllKeyEntries(v as Record<string, unknown>, fullKey),
      );
    } else {
      entries.push({ path: fullKey, value: v });
    }
  }
  return entries;
}

// Extracts variables like {count} or {name}
function extractPlaceholders(str: string): string[] {
  const matches = str.match(/\{[a-zA-Z0-9_-]+\}/g) || [];
  return Array.from(new Set(matches)).sort();
}

// Extracts XML-like markup tags like <terms> or <strong>
function extractTags(str: string): string[] {
  const matches = str.match(/<\/?[a-zA-Z0-9_-]+>/g) || [];
  return Array.from(new Set(matches)).sort();
}

describe("i18n configuration & consistency", () => {
  it("languages.json contains valid entries with no duplicates", () => {
    const codes = languages.map((l) => l.code);
    const uniqueCodes = new Set(codes);
    expect(codes.length).toBe(uniqueCodes.size);
    for (const lang of languages) {
      expect(lang.code).toBeTruthy();
      expect(lang.name).toBeTruthy();
    }
  });

  it("languages.json matches directory structure in src/i18n", () => {
    const configCodes = languages.map((l) => l.code).sort();
    const diskCodes = [...localeDirectories].sort();
    expect(configCodes).toEqual(diskCodes);
  });

  it("routing configuration exposes correct locales and default locale", () => {
    expect(routing.locales).toEqual(languages.map((l) => l.code));
    expect(routing.defaultLocale).toBe("en");
    expect(routing.localePrefix).toBe("never");
    expect(routing.localeCookie).toBeDefined();
    expect(utilLocales).toEqual(routing.locales);
  });

  it("namespaces list matches all JSON files in English base directory", () => {
    const expectedNamespaces = enFiles
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    const registeredNamespaces = [...namespaces].sort();
    expect(registeredNamespaces).toEqual(expectedNamespaces);
  });

  it.each(localeDirectories)(
    "common.json defines correct self-referencing locale code for %s",
    (locale) => {
      const common = JSON.parse(
        readFileSync(path.join(I18N_DIR, locale, "common.json"), "utf8"),
      );
      expect(common.common.locale).toBe(locale);
    },
  );
});

describe("i18n key completeness & parity across locales", () => {
  const nonEnLocales = localeDirectories.filter((l) => l !== "en");

  describe.each(nonEnLocales)("locale: %s", (locale) => {
    it.each(enFiles)("contains 100% matching keys for %s", (filename) => {
      const enFilePath = path.join(EN_DIR, filename);
      const locFilePath = path.join(I18N_DIR, locale, filename);

      expect(
        existsSync(locFilePath),
        `Locale '${locale}' is missing file: ${filename}`,
      ).toBe(true);

      const enJson = JSON.parse(readFileSync(enFilePath, "utf8"));
      const locJson = JSON.parse(readFileSync(locFilePath, "utf8"));

      const enEntries = getAllKeyEntries(enJson);
      const locEntries = getAllKeyEntries(locJson);

      const enKeys = enEntries.map((e) => e.path);
      const locKeys = new Set(locEntries.map((e) => e.path));

      const missingKeys = enKeys.filter((key) => !locKeys.has(key));
      expect(
        missingKeys,
        `Locale '${locale}/${filename}' is missing keys: ${missingKeys.join(", ")}`,
      ).toEqual([]);
    });

    it.each(enFiles)(
      "preserves interpolation placeholders and tags in %s",
      (filename) => {
        const enFilePath = path.join(EN_DIR, filename);
        const locFilePath = path.join(I18N_DIR, locale, filename);

        const enJson = JSON.parse(readFileSync(enFilePath, "utf8"));
        const locJson = JSON.parse(readFileSync(locFilePath, "utf8"));

        const enEntries = getAllKeyEntries(enJson);
        const locMap = new Map(
          getAllKeyEntries(locJson).map((e) => [e.path, e.value]),
        );

        for (const enItem of enEntries) {
          if (typeof enItem.value === "string") {
            const locVal = locMap.get(enItem.path);
            if (typeof locVal === "string") {
              // Plural strings have inner ICU structure, skip standard regex
              if (enItem.value.includes("plural,")) {
                expect(
                  locVal.includes("plural,"),
                  `${locale}/${filename} @ ${enItem.path} missing plural syntax`,
                ).toBe(true);
                continue;
              }

              const enPlaceholders = extractPlaceholders(enItem.value);
              const locPlaceholders = extractPlaceholders(locVal);
              expect(
                locPlaceholders,
                `${locale}/${filename} @ ${enItem.path} missing placeholder`,
              ).toEqual(enPlaceholders);

              const enTags = extractTags(enItem.value);
              const locTags = extractTags(locVal);
              expect(
                locTags,
                `${locale}/${filename} @ ${enItem.path} missing markup tag`,
              ).toEqual(enTags);
            }
          }
        }
      },
    );
  });
});

describe("message tree aggregation (request loader simulation)", () => {
  function deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ) {
    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key]) &&
        target[key] &&
        typeof target[key] === "object" &&
        !Array.isArray(target[key])
      ) {
        deepMerge(
          target[key] as Record<string, unknown>,
          source[key] as Record<string, unknown>,
        );
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  it.each(localeDirectories)(
    "successfully merges all namespaces for %s into a valid message tree",
    (locale) => {
      const merged = namespaces.reduce<Record<string, unknown>>((acc, ns) => {
        const fileContent = JSON.parse(
          readFileSync(path.join(I18N_DIR, locale, `${ns}.json`), "utf8"),
        );
        return deepMerge(acc, fileContent);
      }, {});

      expect(merged).toBeDefined();
      expect(merged.common).toBeDefined();
      expect(merged.auth).toBeDefined();
      expect(merged.editor).toBeDefined();
      expect(merged.project).toBeDefined();
      expect(merged.org).toBeDefined();
    },
  );
});

describe("locale direction (LTR / RTL)", () => {
  it.each(["ar", "fa", "he", "ur"])("uses RTL for %s", (locale) => {
    expect(getDirection(locale)).toBe("rtl");
  });

  it.each(["en", "bn", "fr", "hi", "it", "de", "es", "zh", "ja", "unknown"])(
    "keeps %s LTR",
    (locale) => {
      expect(getDirection(locale)).toBe("ltr");
    },
  );
});

describe("localized text resolution utilities", () => {
  it("resolves direct string value", () => {
    expect(resolveLocalizedText("Plain string", "en")).toBe("Plain string");
    expect(resolveLocalizedText(undefined, "en")).toBe("");
  });

  it("resolves locale-specific object value with fallbacks", () => {
    const dict = { en: "Hello", es: "Hola", hi: "नमस्ते", it: "Ciao" };
    expect(resolveLocalizedText(dict, "it")).toBe("Ciao");
    expect(resolveLocalizedText(dict, "hi")).toBe("नमस्ते");
    expect(resolveLocalizedText(dict, "es")).toBe("Hola");
    expect(resolveLocalizedText(dict, "de")).toBe("Hello"); // fallback to en

    const noEnDict = { fr: "Bonjour", de: "Hallo" };
    expect(resolveLocalizedText(noEnDict, "ja")).toBe("Bonjour"); // fallback to first available
    expect(resolveLocalizedText({}, "en")).toBe("");
  });

  it.each(localeDirectories)(
    "loads menu translations without throwing for %s",
    (locale) => {
      const menu = getMenuTranslations(locale);
      expect(menu).toBeDefined();
      expect(menu.footer_account).toBeDefined();
      expect(menu.user_dashboard).toBeDefined();
    },
  );
});
