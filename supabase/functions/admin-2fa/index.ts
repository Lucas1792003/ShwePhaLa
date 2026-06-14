import { createClient } from "npm:@supabase/supabase-js@2";

// Admin login second factor. After an ADMIN passes the password check, the
// client calls this with { action: "request" } to email a 6-digit code, then
// { action: "verify", code } to confirm it. The plaintext code never leaves the
// server except in the email — only its SHA-256 hash is stored (admin_login_codes,
// migration 042), with a 10-minute expiry. Mirrors the auth + Resend pattern of
// the email-sales-report function.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30_000;

interface AdminTwoFactorRequest {
  action?: "request" | "verify";
  code?: string;
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// SHA-256 hex of the code. The DB only ever holds this digest.
const sha256Hex = async (value: string): Promise<string> => {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

// Cryptographically-random zero-padded 6-digit code.
const generateCode = (): string => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
};

const maskEmail = (email: string): string => {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const head = user.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, user.length - 2))}@${domain}`;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  console.log("[admin-2fa] hit", request.method);
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("REPORT_EMAIL_FROM");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[admin-2fa] missing supabase service config");
    return jsonResponse({ error: "Supabase service configuration is missing." }, 500);
  }
  if (!resendApiKey || !fromEmail) {
    console.error("[admin-2fa] missing email provider config", {
      hasResendKey: Boolean(resendApiKey),
      hasFromEmail: Boolean(fromEmail),
    });
    return jsonResponse({ error: "Email provider is not configured. Set RESEND_API_KEY and REPORT_EMAIL_FROM." }, 500);
  }

  // Authenticate the caller from their Bearer token (same as email-sales-report).
  const authorization = request.headers.get("Authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    console.error("[admin-2fa] missing Authorization header");
    return jsonResponse({ error: "Sign in before verifying." }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    console.error("[admin-2fa] getUser failed", authError?.message);
    return jsonResponse({ error: "Invalid session." }, 401);
  }
  const authUser = authData.user;

  // Resolve the linked app profile and require an active ADMIN.
  const { data: linkedProfile, error: linkedProfileError } = await supabase
    .from("users")
    .select("id, name, email, role, is_active")
    .eq("auth_id", authUser.id)
    .maybeSingle();
  if (linkedProfileError) {
    console.error("[admin-2fa] profile lookup failed", linkedProfileError.message);
    return jsonResponse({ error: linkedProfileError.message }, 500);
  }

  let profile = linkedProfile;
  if (!profile && authUser.email) {
    const { data: emailProfiles, error: emailProfileError } = await supabase
      .from("users")
      .select("id, name, email, role, is_active")
      .ilike("email", authUser.email)
      .limit(2);
    if (emailProfileError) {
      return jsonResponse({ error: emailProfileError.message }, 500);
    }
    if ((emailProfiles ?? []).length === 1) {
      profile = emailProfiles?.[0] ?? null;
    }
  }

  if (!profile || profile.role !== "ADMIN" || !profile.is_active) {
    console.error("[admin-2fa] rejected non-admin", { role: profile?.role, active: profile?.is_active });
    return jsonResponse({ error: "Only an active admin can use login verification." }, 403);
  }

  const recipient = profile.email ?? authUser.email;
  if (!recipient) {
    console.error("[admin-2fa] admin email missing");
    return jsonResponse({ error: "Admin email is missing." }, 400);
  }

  let body: AdminTwoFactorRequest;
  try {
    body = (await request.json()) as AdminTwoFactorRequest;
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }
  console.log("[admin-2fa] action", body.action, "for", recipient);

  // ---- request: generate, store hash, email the code ----
  if (body.action === "request") {
    // Soft rate-limit: refuse a fresh code if one was just issued.
    const { data: recent } = await supabase
      .from("admin_login_codes")
      .select("created_at")
      .eq("auth_id", authUser.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent && Date.now() - new Date(recent.created_at).getTime() < RESEND_COOLDOWN_MS) {
      return jsonResponse({ error: "Please wait a moment before requesting another code." }, 429);
    }

    const code = generateCode();
    const codeHash = await sha256Hex(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

    const insert = await supabase.from("admin_login_codes").insert({
      auth_id: authUser.id,
      code_hash: codeHash,
      expires_at: expiresAt,
    });
    if (insert.error) {
      console.error("[admin-2fa] insert failed", insert.error.message);
      return jsonResponse({ error: insert.error.message }, 500);
    }

    const text = [
      `Your Shwe PhaLar admin login code is ${code}.`,
      "",
      `It expires in ${CODE_TTL_MINUTES} minutes. If you did not try to sign in, ignore this email and change your password.`,
    ].join("\n");
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; max-width: 480px;">
        <h2 style="margin: 0 0 8px;">Admin login verification</h2>
        <p style="color: #475569; margin: 0 0 16px;">Enter this code to finish signing in to Shwe PhaLar.</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; padding: 12px 16px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; display: inline-block;">${code}</div>
        <p style="color: #475569; font-size: 13px; margin: 16px 0 0;">This code expires in ${CODE_TTL_MINUTES} minutes. If you did not try to sign in, ignore this email and change your password.</p>
      </div>
    `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipient],
        subject: "Your Shwe PhaLar admin login code",
        text,
        html,
      }),
    });
    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error("[admin-2fa] Resend rejected", resendResponse.status, errorText);
      return jsonResponse({ error: `Could not send the code: ${errorText}` }, 502);
    }

    const sendResult = await resendResponse.json().catch(() => ({}));
    console.log("[admin-2fa] code emailed to", recipient, "resendId", sendResult?.id ?? null);
    return jsonResponse({ sent: true, expiresAt, email: maskEmail(recipient) });
  }

  // ---- verify: compare against the latest unconsumed code ----
  if (body.action === "verify") {
    const code = (body.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) {
      return jsonResponse({ error: "Enter the 6-digit code." }, 400);
    }

    const { data: row, error: rowError } = await supabase
      .from("admin_login_codes")
      .select("id, code_hash, expires_at, consumed_at, attempts")
      .eq("auth_id", authUser.id)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rowError) {
      return jsonResponse({ error: rowError.message }, 500);
    }
    if (!row) {
      return jsonResponse({ error: "Request a new code." }, 400);
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: "Code expired. Request a new one." }, 400);
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      return jsonResponse({ error: "Too many attempts. Request a new code." }, 429);
    }

    const matches = (await sha256Hex(code)) === row.code_hash;
    if (!matches) {
      await supabase
        .from("admin_login_codes")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      return jsonResponse({ verified: false, error: "Incorrect code." }, 400);
    }

    await supabase
      .from("admin_login_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id);
    return jsonResponse({ verified: true });
  }

  return jsonResponse({ error: "Unknown action." }, 400);
});
