// ============================================================
// Edge Function: rotate-audit-log
//
// Called on a schedule (pg_cron — see supabase/schedule_audit_rotation.sql).
// When `audit_logs` has >= THRESHOLD rows, it archives the OLDEST THRESHOLD
// rows to a CSV, emails that CSV to every active ADMIN, and ONLY THEN
// permanently deletes those exact rows.
//
// Safety: the delete runs strictly after Resend confirms the email was
// accepted, and targets only the ids that went into the CSV — a failed
// email never loses data (the rows stay and get retried next run).
//
// Auth: the caller must present the project service-role key as
// `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (the cron job does).
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const THRESHOLD = 200;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const toBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
};

const csvCell = (value: unknown) => {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

interface AuditRow {
  id: string;
  shop_id: string | null;
  actor_id: string;
  action_type: string;
  message: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("REPORT_EMAIL_FROM");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase service configuration is missing." }, 500);
  }
  if (!resendApiKey || !fromEmail) {
    return jsonResponse({ error: "Email provider is not configured. Set RESEND_API_KEY and REPORT_EMAIL_FROM." }, 500);
  }

  // Only the cron job (holding the service-role key) may invoke this.
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (token !== serviceRoleKey) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 1. How many audit rows exist?
  const { count, error: countError } = await supabase
    .from("audit_logs")
    .select("id", { count: "exact", head: true });
  if (countError) return jsonResponse({ error: countError.message }, 500);
  if ((count ?? 0) < THRESHOLD) {
    return jsonResponse({ rotated: false, count: count ?? 0, threshold: THRESHOLD });
  }

  // 2. Take the OLDEST THRESHOLD rows to archive.
  const { data: rows, error: rowsError } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(THRESHOLD)
    .returns<AuditRow[]>();
  if (rowsError) return jsonResponse({ error: rowsError.message }, 500);
  if (!rows || rows.length === 0) return jsonResponse({ rotated: false, count: count ?? 0 });

  // 3. Resolve actor + shop names for a readable CSV.
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
  const shopIds = [...new Set(rows.map((r) => r.shop_id).filter((s): s is string => Boolean(s)))];
  const [{ data: users }, { data: shops }] = await Promise.all([
    actorIds.length
      ? supabase.from("users").select("id, name").in("id", actorIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    shopIds.length
      ? supabase.from("shops").select("id, name").in("id", shopIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const userName = new Map((users ?? []).map((u) => [u.id, u.name]));
  const shopName = new Map((shops ?? []).map((s) => [s.id, s.name]));

  // 4. Build the CSV (column order matches the Audit Log table in the app).
  const header = ["Action", "Actor", "Branch", "Entity", "Message", "Time", "Entity Id", "Log Id"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.action_type,
        userName.get(r.actor_id) ?? r.actor_id,
        r.shop_id ? shopName.get(r.shop_id) ?? r.shop_id : "",
        r.entity_type,
        r.message,
        r.created_at,
        r.entity_id,
        r.id,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const csv = lines.join("\n");

  // 5. Recipients = every active ADMIN with an email.
  const { data: admins, error: adminError } = await supabase
    .from("users")
    .select("email")
    .eq("role", "ADMIN")
    .eq("is_active", true)
    .not("email", "is", null);
  if (adminError) return jsonResponse({ error: adminError.message }, 500);
  const recipients = [...new Set((admins ?? []).map((a) => a.email).filter((e): e is string => Boolean(e)))];
  if (recipients.length === 0) {
    // No one to send to — do NOT delete; surface so it can be fixed.
    return jsonResponse({ error: "No active admin email on file; rotation skipped (no data deleted)." }, 422);
  }

  // 6. Email the CSV. Delete only if this succeeds.
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);
  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromEmail,
      to: recipients,
      subject: `Shwe PhaLar — Audit log archive (${rows.length} entries, ${stamp})`,
      text:
        `Attached is an archive of the oldest ${rows.length} audit-log entries ` +
        `(${rows[0].created_at} → ${rows[rows.length - 1].created_at}). ` +
        `These entries have been removed from the system after this export.`,
      attachments: [{ filename: `audit-log-${stamp}.csv`, content: toBase64(csv) }],
    }),
  });
  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    return jsonResponse({ error: `Email send failed; no data deleted: ${errorText}` }, 502);
  }

  // 7. Email sent — now permanently delete exactly the archived rows.
  const ids = rows.map((r) => r.id);
  const { error: deleteError } = await supabase.from("audit_logs").delete().in("id", ids);
  if (deleteError) {
    // Email already went out; rows remain and will be re-archived next run.
    return jsonResponse(
      { error: `Archived + emailed, but delete failed (will retry next run): ${deleteError.message}`, emailed: ids.length },
      500,
    );
  }

  return jsonResponse({ rotated: true, archived: ids.length, recipients, remaining: (count ?? 0) - ids.length });
});
