import type { Priority } from "./digest";

export type PackageEventKind = "security" | "major" | "minor" | "patch";
export type AdvisorySeverity = "critical" | "high" | "medium" | "low" | "unknown";

export type PackageGroupDefinition = {
  slug: string;
  label: string;
  primaryPackage: string;
  packages: string[];
  sourceNames: string[];
  repositoryUrl: string;
};

export const packageGroups: PackageGroupDefinition[] = [
  { slug: "react", label: "React", primaryPackage: "react", packages: ["react", "react-dom"], sourceNames: ["React Releases", "React Blog"], repositoryUrl: "https://github.com/facebook/react" },
  { slug: "next", label: "Next.js", primaryPackage: "next", packages: ["next"], sourceNames: ["Next.js Releases", "Next.js Security"], repositoryUrl: "https://github.com/vercel/next.js" },
  { slug: "typescript", label: "TypeScript", primaryPackage: "typescript", packages: ["typescript", "@typescript/native-preview"], sourceNames: ["TypeScript Blog", "typescript-go Releases"], repositoryUrl: "https://github.com/microsoft/TypeScript" },
  { slug: "vite", label: "Vite", primaryPackage: "vite", packages: ["vite"], sourceNames: ["Vite Releases"], repositoryUrl: "https://github.com/vitejs/vite" },
  { slug: "react-router", label: "React Router", primaryPackage: "react-router", packages: ["react-router", "react-router-dom"], sourceNames: ["React Router Releases"], repositoryUrl: "https://github.com/remix-run/react-router" },
  { slug: "redux-toolkit", label: "Redux Toolkit", primaryPackage: "@reduxjs/toolkit", packages: ["@reduxjs/toolkit"], sourceNames: ["Redux Toolkit Releases"], repositoryUrl: "https://github.com/reduxjs/redux-toolkit" },
  { slug: "tanstack-query", label: "TanStack Query", primaryPackage: "@tanstack/react-query", packages: ["@tanstack/react-query"], sourceNames: ["TanStack Query Releases"], repositoryUrl: "https://github.com/TanStack/query" },
  { slug: "storybook", label: "Storybook", primaryPackage: "storybook", packages: ["storybook", "@storybook/react"], sourceNames: ["Storybook Releases"], repositoryUrl: "https://github.com/storybookjs/storybook" },
  { slug: "eslint", label: "ESLint", primaryPackage: "eslint", packages: ["eslint"], sourceNames: ["ESLint Releases"], repositoryUrl: "https://github.com/eslint/eslint" },
  { slug: "prettier", label: "Prettier", primaryPackage: "prettier", packages: ["prettier"], sourceNames: ["Prettier Releases"], repositoryUrl: "https://github.com/prettier/prettier" },
];

export const supportedPackageNames = [...new Set(packageGroups.flatMap(({ packages }) => packages))];

export type CompatibilityRule = {
  range: string;
  minVersion: string;
  maxVersion: string;
  peerDependencies: Record<string, string>;
  optionalPeers: string[];
  nodeRange: string | null;
  deprecated: string | null;
};

export type PackageVersion = {
  version: string;
  publishedAt: string | null;
};

export type PackageVulnerability = {
  packageName: string;
  vulnerableRange: string;
  fixedVersion: string | null;
};

export type PackageAdvisory = {
  ghsaId: string;
  cveId: string | null;
  severity: AdvisorySeverity;
  cvss: number | null;
  title: string;
  summary: string;
  publishedAt: string;
  updatedAt: string;
  url: string;
  vulnerabilities: PackageVulnerability[];
};

export type PackageEvent = {
  id: string;
  kind: PackageEventKind;
  priority: Priority;
  version: string | null;
  title: string;
  summary: string;
  publishedAt: string;
  source: string;
  url: string;
};

export type TrackedPackage = {
  name: string;
  latestVersion: string | null;
  latestPublishedAt: string | null;
  npmUrl: string;
  compatibility: CompatibilityRule[];
  versions: PackageVersion[];
};

export type PackageIntelligence = {
  slug: string;
  label: string;
  primaryPackage: string;
  packageNames: string[];
  latestVersion: string | null;
  latestPublishedAt: string | null;
  npmUrl: string;
  repositoryUrl: string;
  packages: TrackedPackage[];
  advisories: PackageAdvisory[];
  events: PackageEvent[];
};

export type PackageCatalogV1 = {
  schemaVersion: 1;
  generatedAt: string;
  sourceHealth: {
    attempted: number;
    succeeded: number;
    failed: string[];
    stale: boolean;
  };
  packages: PackageIntelligence[];
};

export function packageGroupForName(name: string) {
  const normalized = name.trim().toLowerCase();
  return packageGroups.find(({ packages }) => packages.includes(normalized));
}

export function packageGroupForSlug(slug: string) {
  return packageGroups.find((group) => group.slug === slug);
}

export function packageIntelligenceForName(catalog: PackageCatalogV1, name: string) {
  const normalized = name.trim().toLowerCase();
  return catalog.packages.find(({ packageNames }) => packageNames.includes(normalized));
}
