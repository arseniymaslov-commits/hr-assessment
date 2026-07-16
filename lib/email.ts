type MailInput = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
};

let transporterPromise: Promise<import("nodemailer").Transporter> | null = null;

export function emailActionLink(url: string, label = "Перейти в приложение") {
  return [
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0">',
    "<tr>",
    '<td style="border-radius:6px;background:#e30613">',
    `<a href="${url}" style="display:inline-block;padding:12px 20px;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;font-weight:700">${label}</a>`,
    "</td>",
    "</tr>",
    "</table>",
    `<p style="font-size:12px;color:#64748b">Если кнопка не открывается, используйте ссылку:<br><a href="${url}">${url}</a></p>`
  ].join("");
}

function extractAddress(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim() || fallback;
}

export async function sendMail(input: MailInput): Promise<{
  skipped: boolean;
  recipientsCount: number;
  error?: string;
}> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const fromAddress = process.env.SMTP_FROM_EMAIL || extractAddress(process.env.SMTP_FROM, user || "no-reply@example.com");
  const fromName = process.env.SMTP_FROM_NAME || "Оценка взаимодействия";

  const recipients = Array.from(new Set(input.to.map((email) => email.trim()).filter(Boolean)));

  if (!host || !user || !pass || !recipients.length) {
    console.log(`[mail skipped] ${input.subject}: ${input.to.join(", ")}`);
    return { skipped: true, recipientsCount: recipients.length, error: "SMTP is not configured or recipient list is empty" };
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (!transporterPromise) {
        transporterPromise = import("nodemailer").then((nodemailer) =>
          nodemailer.createTransport({
            host,
            port: Number(process.env.SMTP_PORT || 587),
            secure: Number(process.env.SMTP_PORT || 587) === 465,
            auth: { user, pass },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000
          })
        );
      }
      const transporter = await transporterPromise;
      await transporter.sendMail({
        from: { name: fromName, address: fromAddress },
        to: recipients.join(", "),
        subject: input.subject,
        text: input.text,
        html: input.html
      });
      return { skipped: false, recipientsCount: recipients.length };
    } catch (error) {
      const responseCode =
        typeof error === "object" && error && "responseCode" in error
          ? Number((error as { responseCode?: number }).responseCode)
          : 0;
      const isTemporary = responseCode >= 400 && responseCode < 500;
      console.error(`[mail failed attempt ${attempt}] ${input.subject}:`, error);
      transporterPromise = null;

      if (!isTemporary || attempt === 3) {
        return {
          skipped: true,
          recipientsCount: recipients.length,
          error: error instanceof Error ? error.message : "Unknown SMTP error"
        };
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  return { skipped: true, recipientsCount: recipients.length };
}
