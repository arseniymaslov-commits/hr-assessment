type MailInput = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
};

function extractAddress(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim() || fallback;
}

export async function sendMail(input: MailInput) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const fromAddress = process.env.SMTP_FROM_EMAIL || extractAddress(process.env.SMTP_FROM, user || "no-reply@example.com");
  const fromName = process.env.SMTP_FROM_NAME || "Оценка взаимодействия";

  const recipients = Array.from(new Set(input.to.map((email) => email.trim()).filter(Boolean)));

  if (!host || !user || !pass || !recipients.length) {
    console.log(`[mail skipped] ${input.subject}: ${input.to.join(", ")}`);
    return { skipped: true, recipientsCount: recipients.length };
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user, pass }
  });

  await transporter.sendMail({
    from: { name: fromName, address: fromAddress },
    to: recipients.join(", "),
    subject: input.subject,
    text: input.text,
    html: input.html
  });

  return { skipped: false, recipientsCount: recipients.length };
}
