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
