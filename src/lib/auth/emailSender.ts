interface SendVerificationEmailArgs {
  to: string;
  code: string;
  ttlMinutes: number;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailContent(code: string, ttlMinutes: number): { subject: string; text: string; html: string } {
  const safeCode = escapeHtml(code);
  const subject = '[冰山图宇宙] 邮箱验证码';
  const text = `你的验证码是 ${code}，${ttlMinutes} 分钟内有效。若非本人操作请忽略此邮件。`;
  const html = `
    <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;line-height:1.6;color:#111">
      <h2 style="margin:0 0 12px">冰山图宇宙 - 邮箱验证码</h2>
      <p style="margin:0 0 10px">你的验证码是：</p>
      <div style="display:inline-block;padding:8px 14px;border:1px solid #ddd;border-radius:6px;font-size:22px;letter-spacing:3px;font-weight:700">
        ${safeCode}
      </div>
      <p style="margin:12px 0 0;color:#555">${ttlMinutes} 分钟内有效。若非本人操作，请忽略本邮件。</p>
    </div>
  `;
  return { subject, text, html };
}

export async function sendVerificationEmail({ to, code, ttlMinutes }: SendVerificationEmailArgs): Promise<void> {
  const provider = (process.env.EMAIL_PROVIDER || 'console').toLowerCase();
  const { subject, text, html } = buildEmailContent(code, ttlMinutes);

  if (provider === 'console') {
    console.info(`[EmailVerification][Console] to=${to} code=${code} ttl=${ttlMinutes}m`);
    return;
  }

  if (provider === 'resend') {
    const apiKey = process.env.RESEND_API_KEY || '';
    const from = process.env.EMAIL_FROM || '';
    if (!apiKey || !from) {
      throw new Error('EMAIL_PROVIDER=resend 但未配置 RESEND_API_KEY 或 EMAIL_FROM');
    }

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html,
      }),
    });

    if (!resp.ok) {
      const msg = await resp.text().catch(() => '');
      throw new Error(`Resend 发送失败: HTTP ${resp.status} ${msg}`);
    }
    return;
  }

  if (provider === 'webhook') {
    const webhookUrl = process.env.EMAIL_WEBHOOK_URL || '';
    const webhookSecret = process.env.EMAIL_WEBHOOK_SECRET || '';
    if (!webhookUrl) {
      throw new Error('EMAIL_PROVIDER=webhook 但未配置 EMAIL_WEBHOOK_URL');
    }

    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhookSecret ? { Authorization: `Bearer ${webhookSecret}` } : {}),
      },
      body: JSON.stringify({
        to,
        subject,
        text,
        html,
        code,
        ttlMinutes,
      }),
    });

    if (!resp.ok) {
      const msg = await resp.text().catch(() => '');
      throw new Error(`Webhook 发送失败: HTTP ${resp.status} ${msg}`);
    }
    return;
  }

  throw new Error(`不支持的 EMAIL_PROVIDER: ${provider}`);
}
