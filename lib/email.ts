type MailInput = {
  to: string[];
  subject: string;
  text: string;
};

export async function sendMail(input: MailInput) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM || "no-reply@example.com";

  if (!host || !user || !pass || !input.to.length) {
    console.log(`[mail skipped] ${input.subject}: ${input.to.join(", ")}`);
    return { skipped: true };
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user, pass }
  });

  await transporter.sendMail({
    from,
    to: input.to.join(", "),
    subject: input.subject,
    text: input.text
  });

  return { skipped: false };
}
