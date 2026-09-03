const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const basePath = configuredBasePath === "/"
  ? ""
  : configuredBasePath.replace(/\/$/, "");

export function sitePath(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${basePath}${normalized}` || "/";
}

export function archivePath(date?: string) {
  return sitePath(date ? `/archive/${date}/` : "/archive/");
}

export function weeklyPath() {
  return sitePath("/weekly/");
}

export function projectPath() {
  return sitePath("/project/");
}

export function comparePath(params?: { slug?: string; from?: string; to?: string }) {
  const path = sitePath("/compare/");
  if (!params || (!params.slug && !params.from && !params.to)) return path;
  const query = new URLSearchParams();
  if (params.slug) query.set("package", params.slug);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  return `${path}?${query.toString()}`;
}

export function migrationPath(slug: string, transition: string) {
  return sitePath(`/migrations/${slug}/${transition}/`);
}

export function packagesPath(slug?: string) {
  return sitePath(slug ? `/packages/${slug}/` : "/packages/");
}

export function packageCatalogPath() {
  return sitePath("/package-catalog.json");
}
