import catalog from "@/data/packages/catalog.json";

export function GET() {
  return Response.json(catalog, {
    headers: {
      "cache-control": "public, max-age=900, stale-while-revalidate=86400",
    },
  });
}
