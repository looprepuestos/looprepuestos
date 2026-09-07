import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "product-images";
const MAX_BYTES = 5 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function decodeBase64(value: string) {
  const normalized = value.replace(/\s/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const token = request.headers.get("x-loop-sync-token")?.trim() ?? "";
  if (!token) return json(401, { ok: false, error: "missing_token" });

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json(500, { ok: false, error: "server_config" });

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: config, error: configError } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "sheet_sync_token_sha256")
    .maybeSingle();

  if (configError) return json(500, { ok: false, error: "config_read_failed" });

  const expected = typeof config?.value === "string"
    ? config.value
    : config?.value && typeof config.value === "object" && "hash" in config.value
      ? String((config.value as { hash?: unknown }).hash ?? "")
      : "";

  if (!expected) return json(503, { ok: false, error: "upload_not_armed" });
  if ((await sha256Hex(token)).toLowerCase() !== expected.toLowerCase()) {
    return json(401, { ok: false, error: "invalid_token" });
  }

  let body: { sku?: unknown; content_type?: unknown; data_base64?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const sku = String(body.sku ?? "").trim();
  const contentType = String(body.content_type ?? "").toLowerCase();
  const extension = MIME_EXTENSIONS[contentType];
  const base64 = String(body.data_base64 ?? "");

  if (!sku) return json(400, { ok: false, error: "missing_sku" });
  if (!extension) return json(400, { ok: false, error: "invalid_image_type" });
  if (!base64) return json(400, { ok: false, error: "missing_image" });

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(base64);
  } catch {
    return json(400, { ok: false, error: "invalid_base64" });
  }

  if (bytes.byteLength > MAX_BYTES) {
    return json(413, { ok: false, error: "image_too_large", max_bytes: MAX_BYTES });
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("sku")
    .eq("sku", sku)
    .maybeSingle();

  if (productError) return json(500, { ok: false, error: "product_read_failed" });
  if (!product) return json(404, { ok: false, error: "product_not_found" });

  const objectPath = `products/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, bytes, {
      contentType,
      cacheControl: "31536000",
      upsert: false,
    });

  if (uploadError) {
    return json(500, { ok: false, error: "upload_failed", detail: uploadError.message });
  }

  const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  const imageUrl = publicUrl.publicUrl;
  const { error: updateError } = await supabase
    .from("products")
    .update({ imagen_url: imageUrl })
    .eq("sku", sku);

  if (updateError) {
    await supabase.storage.from(BUCKET).remove([objectPath]);
    return json(500, { ok: false, error: "product_update_failed", detail: updateError.message });
  }

  return json(200, { ok: true, sku, imagen_url: imageUrl });
});
