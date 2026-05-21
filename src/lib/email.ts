const resendApiKey = process.env.RESEND_API_KEY?.trim() ?? "";
const defaultRecipient = process.env.NOTIFICATION_EMAIL_TO?.trim() || process.env.SUPER_ADMIN_EMAIL?.trim() || "";
const defaultSender = process.env.EMAIL_FROM?.trim() || "League App <onboarding@resend.dev>";

type SendEmailOptions = {
  to?: string | null;
  subject: string;
  text: string;
  html?: string;
};

export async function sendNotificationEmail(options: SendEmailOptions): Promise<{ sent: boolean; reason?: string }> {
  const to = options.to?.trim() || defaultRecipient;
  if (!resendApiKey) return { sent: false, reason: "RESEND_API_KEY not configured" };
  if (!to) return { sent: false, reason: "No notification recipient configured" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: defaultSender,
      to: [to],
      subject: options.subject,
      text: options.text,
      html: options.html ?? `<pre>${escapeHtml(options.text)}</pre>`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { sent: false, reason: body || `HTTP ${res.status}` };
  }

  return { sent: true };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
