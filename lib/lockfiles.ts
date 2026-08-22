import { maxSatisfying, valid } from "semver";
import type { ParseError } from "jsonc-parser";
import type { PackageManager, ProjectPackage } from "./project";

export type LockfileResolution = {
  manager: PackageManager;
  versions: Record<string, string>;
  warnings: string[];
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanVersion(value: unknown) {
  if (typeof value !== "string") return null;
  const withoutProtocol = value.replace(/^npm:/, "").replace(/^\//, "");
  const match = withoutProtocol.match(/(?:^|@)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
  return match && valid(match[1]) ? match[1] : valid(withoutProtocol)?.toString() ?? null;
}

function resolvePackageLock(text: string, packages: ProjectPackage[]): LockfileResolution {
  const parsed = JSON.parse(text) as UnknownRecord;
  const versions: Record<string, string> = {};
  const packageEntries = isRecord(parsed.packages) ? parsed.packages : {};
  const dependencyEntries = isRecord(parsed.dependencies) ? parsed.dependencies : {};
  for (const item of packages) {
    const modern = packageEntries[`node_modules/${item.name}`];
    const legacy = dependencyEntries[item.name];
    const version = cleanVersion(isRecord(modern) ? modern.version : isRecord(legacy) ? legacy.version : null);
    if (version) versions[item.name] = version;
  }
  return { manager: "npm", versions, warnings: [] };
}

function dependencyVersion(value: unknown) {
  if (typeof value === "string") return cleanVersion(value);
  if (!isRecord(value)) return null;
  return cleanVersion(value.version ?? value.resolution ?? value.specifier);
}

async function resolvePnpm(text: string, packages: ProjectPackage[]): Promise<LockfileResolution> {
  const { parse } = await import("yaml");
  const parsed = parse(text) as UnknownRecord;
  if (!isRecord(parsed)) throw new Error("pnpm-lock.yaml не содержит объект lock-файла.");
  const importers = isRecord(parsed.importers) ? parsed.importers : {};
  const importerValues = Object.values(importers).filter(isRecord);
  if (!isRecord(importers["."]) && importerValues.length > 1) throw new Error("Обнаружен pnpm workspace. React Stack Check пока проверяет только один проект с корневым importer '.'.");
  const root = isRecord(importers["."]) ? importers["."] : importerValues[0] ?? {};
  const versions: Record<string, string> = {};
  for (const item of packages) {
    for (const section of ["dependencies", "optionalDependencies", "devDependencies"]) {
      const values = isRecord(root[section]) ? root[section] as UnknownRecord : {};
      const version = dependencyVersion(values[item.name]);
      if (version) {
        versions[item.name] = version;
        break;
      }
    }
  }
  return { manager: "pnpm", versions, warnings: [] };
}

function yarnCandidates(parsed: UnknownRecord, packageName: string, declared: string) {
  const exactDescriptor = `${packageName}@${declared}`;
  return Object.entries(parsed).flatMap(([descriptor, value]) => {
    const descriptors = descriptor.split(/,\s*/).map((entry) => entry.replace(/^"|"$/g, ""));
    const matches = descriptors.some((entry) => entry === exactDescriptor || entry.startsWith(`${packageName}@`));
    const classicVersion = typeof value === "string" ? value.match(/(?:^|\s)version\s+"([^"]+)"/)?.[1] : null;
    const version = cleanVersion(classicVersion ?? (isRecord(value) ? value.version ?? value.resolution : null));
    return matches && version ? [version] : [];
  });
}

async function resolveYarn(text: string, packages: ProjectPackage[]): Promise<LockfileResolution> {
  const { parseSyml } = await import("@yarnpkg/parsers");
  const parsed = parseSyml(text) as UnknownRecord;
  const versions: Record<string, string> = {};
  for (const item of packages) {
    const candidates = yarnCandidates(parsed, item.name, item.declaredVersion ?? item.version);
    const declared = item.declaredVersion ?? item.version;
    const selected = maxSatisfying(candidates, declared, { includePrerelease: true }) ?? candidates.sort().at(-1);
    if (selected) versions[item.name] = selected;
  }
  return { manager: "yarn", versions, warnings: [] };
}

function bunCandidates(parsed: UnknownRecord, packageName: string) {
  const entries = isRecord(parsed.packages) ? parsed.packages : {};
  return Object.keys(entries).flatMap((descriptor) => {
    if (!descriptor.startsWith(`${packageName}@`)) return [];
    const version = cleanVersion(descriptor.slice(packageName.length + 1));
    return version ? [version] : [];
  });
}

async function resolveBun(text: string, packages: ProjectPackage[]): Promise<LockfileResolution> {
  const { parse, printParseErrorCode } = await import("jsonc-parser");
  const errors: ParseError[] = [];
  const parsed = parse(text, errors, { allowTrailingComma: true, disallowComments: false }) as UnknownRecord;
  if (errors.length || !isRecord(parsed)) throw new Error(`bun.lock не разобран: ${errors[0] ? printParseErrorCode(errors[0].error) : "неверная структура"}.`);
  const versions: Record<string, string> = {};
  for (const item of packages) {
    const candidates = bunCandidates(parsed, item.name);
    const declared = item.declaredVersion ?? item.version;
    const selected = maxSatisfying(candidates, declared, { includePrerelease: true }) ?? candidates.sort().at(-1);
    if (selected) versions[item.name] = selected;
  }
  return { manager: "bun", versions, warnings: [] };
}

export async function parseLockfile(fileName: string, text: string, packages: ProjectPackage[]): Promise<LockfileResolution> {
  const normalized = fileName.toLowerCase();
  let result: LockfileResolution;
  if (normalized === "package-lock.json" || normalized === "npm-shrinkwrap.json") result = resolvePackageLock(text, packages);
  else if (normalized === "pnpm-lock.yaml" || normalized === "pnpm-lock.yml") result = await resolvePnpm(text, packages);
  else if (normalized === "yarn.lock") result = await resolveYarn(text, packages);
  else if (normalized === "bun.lock") result = await resolveBun(text, packages);
  else if (normalized === "bun.lockb") throw new Error("bun.lockb — бинарный формат. Выполните bun install --save-text-lockfile и выберите bun.lock.");
  else throw new Error("Поддерживаются package-lock.json, pnpm-lock.yaml, yarn.lock и текстовый bun.lock.");

  const unresolved = packages.filter(({ name }) => !result.versions[name]).map(({ name }) => name);
  return {
    ...result,
    warnings: unresolved.length ? [`Не удалось найти точную версию: ${unresolved.join(", ")}. Для них будет использован диапазон package.json.`] : [],
  };
}
