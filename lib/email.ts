const RESEND_API_URL = "https://api.resend.com/emails";

function fromAddress() {
  return process.env.EMAIL_FROM || "AI Schedule <onboarding@resend.dev>";
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromAddress(), to: [to], subject, html }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
  email: string;
  password: string;
  businessName?: string;
  appUrl?: string;
}): Promise<boolean> {
  const appUrl = params.appUrl || process.env.NEXT_PUBLIC_APP_URL || "";
  const loginUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/login` : "";
  const html = `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; color: #1c193c;">
      <h2 style="margin-bottom: 4px;">Welcome to AI Schedule${params.businessName ? `, ${params.businessName}` : ""}!</h2>
      <p>Hi ${params.name},</p>
      <p>An account was created for you. Here are your sign-in details:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 6px 0; color: #6b6a80;">Email</td><td style="padding: 6px 0; font-weight: 600;">${params.email}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b6a80;">Temporary password</td><td style="padding: 6px 0; font-weight: 600; font-family: monospace;">${params.password}</td></tr>
      </table>
      <p>Please sign in and consider this password temporary.</p>
      ${loginUrl ? `<p><a href="${loginUrl}" style="display: inline-block; background: #6c5ce7; color: white; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: 600;">Sign in</a></p>` : ""}
      <p style="color: #9d9caf; font-size: 12px; margin-top: 24px;">If you weren't expecting this email, you can ignore it.</p>
    </div>
  `;
  return sendEmail(params.email, "Your AI Schedule account is ready", html);
}
