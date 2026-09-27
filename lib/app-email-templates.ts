import "server-only";

type EmailContent = {
  subject: string;
  text: string;
  html: string;
};

type ShellInput = {
  preheader: string;
  title: string;
  eyebrow?: string;
  body: string[];
  cta?: { label: string; href: string };
  code?: string;
  note?: string;
};

export function verificationCodeEmail(code: string): EmailContent {
  return emailShell({
    preheader: `Gunakan kode ${code} untuk memverifikasi akun My Landing kamu.`,
    eyebrow: "Verifikasi akun",
    title: `${code} adalah kode verifikasi kamu`,
    body: [
      "Masukkan kode ini di halaman verifikasi My Landing untuk mengaktifkan akun kamu.",
      "Kode hanya berlaku selama 15 menit. Demi keamanan, jangan bagikan kode ini ke siapa pun, termasuk pihak yang mengaku dari My Landing.",
    ],
    code,
    note: "Kalau kamu tidak membuat akun My Landing, kamu bisa mengabaikan email ini.",
  });
}

export function memberClaimCodeEmail(input: {
  code: string;
  workspaceName: string;
}): EmailContent {
  return emailShell({
    preheader: `Gunakan kode ${input.code} untuk mengaktifkan login member kamu.`,
    eyebrow: "Keamanan member",
    title: `${input.code} adalah kode verifikasi kamu`,
    body: [
      `Ada permintaan untuk mengaktifkan login member pada ${input.workspaceName} menggunakan alamat email ini.`,
      "Masukkan kode ini untuk membuktikan bahwa alamat email tersebut memang milik kamu.",
    ],
    code: input.code,
    note: "Kalau kamu tidak meminta akses ini, abaikan email ini. Data dan akses member kamu tidak berubah.",
  });
}

export function passwordResetEmail(input: {
  name?: string | null;
  resetUrl: string;
}): EmailContent {
  const greeting = input.name?.trim()
    ? `Halo ${input.name.trim()},`
    : "Halo,";

  return emailShell({
    preheader:
      "Kami menerima permintaan untuk mengatur ulang password akun My Landing kamu.",
    eyebrow: "Reset password",
    title: "Atur ulang password My Landing",
    body: [
      greeting,
      "Kami menerima permintaan untuk mengatur ulang password akun My Landing kamu. Klik tombol di bawah untuk membuat password baru.",
      "Link ini hanya berlaku selama 60 menit dan hanya bisa digunakan satu kali.",
    ],
    cta: { label: "Atur ulang password", href: input.resetUrl },
    note: "Kalau kamu tidak meminta reset password, abaikan email ini. Password kamu tidak akan berubah.",
  });
}

export function welcomeEmail(input: {
  name?: string | null;
  dashboardUrl: string;
}): EmailContent {
  const greeting = input.name?.trim()
    ? `Selamat datang, ${input.name.trim()}.`
    : "Selamat datang di My Landing.";

  return emailShell({
    preheader:
      "Akun kamu sudah aktif. Mulai buat landing page, produk, kursus, dan form dari satu dashboard.",
    eyebrow: "Akun aktif",
    title: "Selamat datang di My Landing",
    body: [
      greeting,
      "Email kamu sudah berhasil diverifikasi. Sekarang kamu bisa mulai membuat workspace, membangun halaman, mengatur produk, menerima form, dan menghubungkan integrasi yang kamu butuhkan.",
      "Kami akan memakai email ini hanya untuk notifikasi penting terkait akun dan keamanan.",
    ],
    cta: { label: "Buka dashboard", href: input.dashboardUrl },
    note: "Butuh bantuan? Balas email ini atau hubungi support@landing.my.id.",
  });
}

export function workspaceInvitationEmail(input: {
  workspaceName: string;
  inviterName: string;
  roleLabel: string;
  actionUrl: string;
  existingUser: boolean;
}): EmailContent {
  const actionText = input.existingUser
    ? "Akses kamu sudah aktif. Buka dashboard untuk mulai berkolaborasi."
    : "Buat akun atau masuk memakai email ini. Akses akan aktif otomatis setelah kamu login.";

  return emailShell({
    preheader: `${input.inviterName} mengundang kamu ke workspace ${input.workspaceName} di My Landing.`,
    eyebrow: "Undangan workspace",
    title: `Kamu diundang ke ${input.workspaceName}`,
    body: [
      `${input.inviterName} memberi kamu akses sebagai ${input.roleLabel} di workspace ${input.workspaceName}.`,
      actionText,
      "Undangan pending berlaku 14 hari. Abaikan email ini kalau kamu tidak mengenal pengirimnya.",
    ],
    cta: { label: "Buka My Landing", href: input.actionUrl },
    note: "Akses workspace mengikuti role yang dipilih oleh admin workspace.",
  });
}

function emailShell(input: ShellInput): EmailContent {
  const subject = input.title;
  const safeTitle = escapeHtml(input.title);
  const safeEyebrow = input.eyebrow ? escapeHtml(input.eyebrow) : "";
  const bodyHtml = input.body
    .map((line) => `<p style="margin:0 0 14px">${escapeHtml(line)}</p>`)
    .join("");
  const ctaHtml = input.cta
    ? `<p style="margin:22px 0"><a href="${escapeHtml(input.cta.href)}" style="display:inline-block;border-radius:8px;background:#18181b;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 16px">${escapeHtml(input.cta.label)}</a></p><p style="margin:0 0 14px;color:#71717a;font-size:13px">Kalau tombol tidak bisa diklik, buka link ini:<br><span style="word-break:break-all">${escapeHtml(input.cta.href)}</span></p>`
    : "";
  const codeHtml = input.code
    ? `<div style="margin:20px 0 18px;padding:16px;border:1px solid #e4e4e7;border-radius:12px;background:#fafafa;text-align:center"><div style="font-size:13px;color:#71717a;margin-bottom:6px">Kode verifikasi</div><div style="font-size:32px;line-height:1.2;font-weight:800;letter-spacing:6px;color:#18181b">${escapeHtml(input.code)}</div></div>`
    : "";
  const noteHtml = input.note
    ? `<p style="margin:18px 0 0;color:#71717a;font-size:13px">${escapeHtml(input.note)}</p>`
    : "";

  const text = [
    input.title,
    "",
    ...input.body,
    "",
    input.code ? `Kode verifikasi: ${input.code}` : "",
    input.cta ? `${input.cta.label}: ${input.cta.href}` : "",
    input.note ? `Catatan: ${input.note}` : "",
    "",
    "My Landing",
    "Email ini dikirim oleh My Landing untuk notifikasi akun dan keamanan.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject,
    text,
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;color:#18181b;font-family:Arial,Helvetica,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:24px 0">
      <tr>
        <td align="center" style="padding:0 16px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:14px">
            <tr>
              <td style="padding:24px 24px 10px">
                <div style="font-size:16px;font-weight:800;color:#18181b">My Landing</div>
                ${safeEyebrow ? `<div style="margin-top:18px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#71717a;font-weight:700">${safeEyebrow}</div>` : ""}
                <h1 style="margin:8px 0 14px;font-size:24px;line-height:1.25;color:#18181b">${safeTitle}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px;font-size:15px;line-height:1.65;color:#3f3f46">
                ${bodyHtml}
                ${codeHtml}
                ${ctaHtml}
                ${noteHtml}
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e4e4e7;padding:16px 24px;color:#71717a;font-size:12px;line-height:1.5">
                Email ini dikirim oleh My Landing untuk notifikasi akun dan keamanan. Tidak ada lampiran atau gambar eksternal di email ini.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
