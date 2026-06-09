import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface OpenShiftNoticeEntry {
  cashier?: string;
  branch?: string;
}

interface OpenShiftNotice {
  openShiftCount?: number;
  entries?: OpenShiftNoticeEntry[];
  summary?: string;
}

interface CsvAttachmentInput {
  filename?: string;
  csv?: string;
}

interface ShopSummaryInput {
  shopName?: string;
  shopCode?: string;
  filename?: string;
  saleCount?: number;
  rowCount?: number;
}

interface EmailSalesReportRequest {
  /** Legacy single-CSV mode — still accepted for backward compatibility
   *  with older clients. New per-shop callers send `attachments` instead. */
  csv?: string;
  filename?: string;
  /** New per-shop mode: one CSV attachment per shop. */
  attachments?: CsvAttachmentInput[];
  /** Human-readable summary of each per-shop attachment. Rendered in
   *  the email body so the admin sees a sales-per-branch breakdown at
   *  a glance before opening the CSVs. */
  shopSummaries?: ShopSummaryInput[];
  subject?: string;
  reportDateLabel?: string;
  /** Legacy single-mode counts. */
  saleCount?: number;
  rowCount?: number;
  /** Per-shop mode aggregate counts. */
  totalSaleCount?: number;
  totalRowCount?: number;
  /**
   * Optional informational notice — used when one or more cashier shifts
   * were still open at the time the admin sent the report. The function
   * surfaces it as a banner at the top of the email body so the admin
   * knows the figures may not be the final end-of-day numbers.
   */
  openShiftNotice?: OpenShiftNotice | null;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const toBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

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

  const authorization = request.headers.get("Authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return jsonResponse({ error: "Sign in as an admin before sending reports." }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return jsonResponse({ error: "Invalid session." }, 401);
  }

  const { data: linkedProfile, error: linkedProfileError } = await supabase
    .from("users")
    .select("id, name, email, role, is_active")
    .eq("auth_id", authData.user.id)
    .maybeSingle();

  if (linkedProfileError) {
    return jsonResponse({ error: linkedProfileError.message }, 500);
  }

  let profile = linkedProfile;
  if (!profile && authData.user.email) {
    const { data: emailProfiles, error: emailProfileError } = await supabase
      .from("users")
      .select("id, name, email, role, is_active")
      .ilike("email", authData.user.email)
      .limit(2);

    if (emailProfileError) {
      return jsonResponse({ error: emailProfileError.message }, 500);
    }

    if ((emailProfiles ?? []).length === 1) {
      profile = emailProfiles?.[0] ?? null;
    }
  }

  if (!profile || profile.role !== "ADMIN" || !profile.is_active) {
    return jsonResponse({ error: "Only an active admin can email the daily sales report." }, 403);
  }

  const recipient = profile.email ?? authData.user.email;
  if (!recipient) {
    return jsonResponse({ error: "Admin email is missing." }, 400);
  }

  const body = (await request.json()) as EmailSalesReportRequest;
  if (!body.subject) {
    return jsonResponse({ error: "subject is required." }, 400);
  }

  // Normalise both payload shapes into the same `attachmentList`. The
  // new per-shop caller sends `attachments: [{ filename, csv }]`; the
  // legacy single-CSV caller still uses `csv` + `filename`. Either is
  // accepted so a stale client can keep working until it updates.
  const rawAttachments: CsvAttachmentInput[] = Array.isArray(body.attachments)
    ? body.attachments
    : body.csv && body.filename
      ? [{ filename: body.filename, csv: body.csv }]
      : [];
  const attachmentList = rawAttachments
    .filter((entry): entry is { filename: string; csv: string } =>
      typeof entry.filename === "string" && entry.filename.length > 0
        && typeof entry.csv === "string",
    );

  const reportDate = body.reportDateLabel ?? "today";
  // Prefer the new aggregate totals; fall back to legacy single-mode.
  const totalSaleCount = Number(body.totalSaleCount ?? body.saleCount ?? 0);
  const totalRowCount = Number(body.totalRowCount ?? body.rowCount ?? 0);
  const shopSummaries = (body.shopSummaries ?? []).map((entry) => ({
    shopName: entry.shopName ?? "Unknown shop",
    shopCode: entry.shopCode ?? "",
    filename: entry.filename ?? "",
    saleCount: Number(entry.saleCount ?? 0),
    rowCount: Number(entry.rowCount ?? 0),
  }));

  // Optional incomplete-data notice. Built once and used for both the
  // plain-text and HTML email bodies so the same warning lands no
  // matter which view the recipient's client falls back to.
  const notice = body.openShiftNotice;
  const noticeActive = Boolean(notice && (notice.openShiftCount ?? 0) > 0);
  const noticeEntries = (notice?.entries ?? []).map((entry) => ({
    cashier: entry.cashier ?? "Unknown cashier",
    branch: entry.branch ?? "Unknown branch",
  }));
  const noticeSummary = notice?.summary ?? "";

  // Plain-text body. Mirrors the HTML structure so a client that
  // prefers text/plain still sees the per-shop breakdown.
  const textLines = [
    `Daily sales report for ${reportDate}.`,
    "",
    `Total sales: ${totalSaleCount}`,
    `Total CSV rows: ${totalRowCount}`,
    "",
  ];
  if (shopSummaries.length > 0) {
    textLines.push("Per-shop breakdown:");
    for (const summary of shopSummaries) {
      const label = summary.shopCode ? `${summary.shopName} (${summary.shopCode})` : summary.shopName;
      textLines.push(`  • ${label} — ${summary.saleCount} sale${summary.saleCount === 1 ? "" : "s"}, ${summary.rowCount} CSV rows — ${summary.filename}`);
    }
    textLines.push("");
  } else if (totalSaleCount === 0) {
    textLines.push("No sales were recorded today.", "");
  }
  if (noticeActive) {
    textLines.push(
      "⚠ DATA MAY BE INCOMPLETE",
      noticeSummary,
      ...noticeEntries.map((entry) => `  • ${entry.cashier} — ${entry.branch}`),
      "",
      "The figures in the attached CSV(s) cover sales recorded so far.",
      "Sales rung up after these shifts close will not appear here.",
    );
  } else {
    textLines.push(
      "This report was generated from all branches after every cashier shift was closed.",
    );
  }
  const text = textLines.join("\n");

  const noticeHtml = noticeActive
    ? `
      <div style="margin: 12px 0; padding: 12px 16px; border: 1px solid #fcd34d; background: #fffbeb; border-radius: 8px; color: #92400e;">
        <div style="font-weight: 600; margin-bottom: 6px;">⚠ Data may be incomplete</div>
        <div style="font-size: 13px; line-height: 1.5;">${escapeHtml(noticeSummary)}</div>
        ${
          noticeEntries.length > 0
            ? `<ul style="margin: 8px 0 0 18px; padding: 0; font-size: 13px;">${noticeEntries
                .map((entry) =>
                  `<li>${escapeHtml(entry.cashier)} <span style="color:#a16207;">— ${escapeHtml(entry.branch)}</span></li>`,
                )
                .join("")}</ul>`
            : ""
        }
        <div style="font-size: 12px; margin-top: 8px; color: #78350f;">
          Sales rung up after these shifts close will not appear in these CSVs.
        </div>
      </div>
    `
    : "";

  const shopBreakdownHtml = shopSummaries.length > 0
    ? `
      <h3 style="margin: 16px 0 6px; font-size: 14px; color: #0f172a;">Per-shop breakdown</h3>
      <table style="border-collapse: collapse; font-size: 13px; width: 100%;">
        <thead>
          <tr style="text-align: left; color: #475569; border-bottom: 1px solid #e2e8f0;">
            <th style="padding: 4px 8px 4px 0; font-weight: 600;">Shop</th>
            <th style="padding: 4px 8px; font-weight: 600; text-align: right;">Sales</th>
            <th style="padding: 4px 8px; font-weight: 600; text-align: right;">CSV rows</th>
            <th style="padding: 4px 0 4px 8px; font-weight: 600;">Attachment</th>
          </tr>
        </thead>
        <tbody>
          ${shopSummaries
            .map(
              (summary) => `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 6px 8px 6px 0;">${escapeHtml(summary.shopName)}${
                  summary.shopCode ? ` <span style="color:#94a3b8;">(${escapeHtml(summary.shopCode)})</span>` : ""
                }</td>
                <td style="padding: 6px 8px; text-align: right; font-weight: 600;">${summary.saleCount}</td>
                <td style="padding: 6px 8px; text-align: right;">${summary.rowCount}</td>
                <td style="padding: 6px 0 6px 8px; color: #475569; font-family: monospace; font-size: 12px;">${escapeHtml(summary.filename)}</td>
              </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    `
    : totalSaleCount === 0
      ? `<p style="margin-top: 16px; color: #475569;">No sales were recorded today.</p>`
      : "";

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; max-width: 640px;">
      <h2 style="margin: 0 0 4px;">Daily sales report</h2>
      <div style="color: #475569;">${escapeHtml(reportDate)}</div>
      ${noticeHtml}
      <table style="margin-top: 12px; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 2px 8px 2px 0; color: #475569;">Total sales</td><td style="padding: 2px 0; font-weight: 600;">${totalSaleCount}</td></tr>
        <tr><td style="padding: 2px 8px 2px 0; color: #475569;">Total CSV rows</td><td style="padding: 2px 0; font-weight: 600;">${totalRowCount}</td></tr>
        <tr><td style="padding: 2px 8px 2px 0; color: #475569;">Attachments</td><td style="padding: 2px 0; font-weight: 600;">${attachmentList.length}</td></tr>
      </table>
      ${shopBreakdownHtml}
      <p style="margin-top: 16px; font-size: 13px; color: #475569;">
        One receipt-line CSV per shop is attached.
      </p>
    </div>
  `;

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [recipient],
      subject: body.subject,
      text,
      html,
      attachments: attachmentList.map((entry) => ({
        filename: entry.filename,
        content: toBase64(entry.csv),
      })),
    }),
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    return jsonResponse({ error: `Email send failed: ${errorText}` }, 502);
  }

  const result = await resendResponse.json();
  return jsonResponse({ sent: true, recipient, id: result.id ?? null });
});
