type Env = {
  APP_NAME?: string;
  SIGNFLOW_FILES: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
};

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function cors(request: Request) {
  const origin = request.headers.get("origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-max-age": "86400",
  };
}

function methodNotAllowed(request: Request) {
  return json(
    { error: "Method not allowed" },
    { status: 405, headers: cors(request) },
  );
}

async function handleHealth(request: Request, env: Env) {
  return json(
    {
      ok: true,
      app: env.APP_NAME || "Buxton SignFlow",
      storage: Boolean(env.SIGNFLOW_FILES),
      supabaseConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
    },
    { headers: cors(request) },
  );
}

async function handleUploadUrl(request: Request, env: Env) {
  if (request.method !== "POST") return methodNotAllowed(request);

  const body = await request.json().catch(() => null) as
    | { contractId?: string; fileKind?: string; filename?: string }
    | null;

  if (!body?.contractId || !body?.fileKind || !body?.filename) {
    return json(
      { error: "contractId, fileKind, and filename are required." },
      { status: 400, headers: cors(request) },
    );
  }

  const safeFilename = body.filename.replace(/[^\w.\- ]+/g, "-");
  const key = `contracts/${body.contractId}/${body.fileKind}/${safeFilename}`;

  // First migration step only: return the planned R2 key. Actual signed upload
  // URLs will be added after the frontend/backend contract is finalized.
  return json({ key, bucket: "SIGNFLOW_FILES" }, { headers: cors(request) });
}

export default {
  async fetch(request: Request, env: Env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(request) });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return handleHealth(request, env);
    }

    if (url.pathname === "/api/files/upload-url") {
      return handleUploadUrl(request, env);
    }

    return json(
      { error: "Not found", path: url.pathname },
      { status: 404, headers: cors(request) },
    );
  },
};

