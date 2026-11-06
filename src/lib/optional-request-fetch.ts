const optionalTables = new Set(["admin_requests", "profile_merge_requests", "player_deletion_requests"]);

/** Skip reads of confirmed absent legacy features. Writes and all real errors pass through. */
export function createOptionalRequestFetch(baseFetch: typeof fetch, supabaseUrl: string): typeof fetch {
  let capabilities: Promise<Record<string, boolean> | null> | null = null;
  let expiresAt = 0;
  const getCapabilities = () => {
    if (!capabilities || Date.now() >= expiresAt) {
      expiresAt = Date.now() + 300000;
      capabilities = baseFetch("/api/public/request-capabilities").then(async response => {
        if (!response.ok) throw new Error(`Capability lookup failed (${response.status})`);
        return await response.json() as Record<string, boolean>;
      }).catch(error => {
        console.warn("Optional request availability unknown; preserving normal requests", error);
        return null;
      });
    }
    return capabilities;
  };
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const table = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1];
    if (typeof window !== "undefined" && url.origin === new URL(supabaseUrl).origin && table && optionalTables.has(table) && (method === "GET" || method === "HEAD")) {
      const available = await getCapabilities();
      if (available?.[table] === false) {
        return new Response(method === "HEAD" ? null : "[]", { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "*/0" } });
      }
    }
    return baseFetch(input, init);
  };
}
