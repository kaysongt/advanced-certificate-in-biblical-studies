import type {
  PaymentReminderMilestone,
  PaymentReminderTiming,
} from "@/lib/reminders/payment-reminder-policy";

type PaymentReminderEmailInput = {
  fullName: string;
  amount: number;
  currency: string;
  timing: PaymentReminderTiming & { milestone: PaymentReminderMilestone };
  dashboardUrl: string;
  scholarshipUrl: string;
};

export type PaymentReminderEmail = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] ?? character
  );
}

function tuition(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function timingCopy(
  timing: PaymentReminderEmailInput["timing"]
): { eyebrow: string; subject: string; heading: string; introduction: string } {
  if (timing.milestone === "started") {
    return {
      eyebrow: "Class access reminder",
      subject: `Payment required to access ${timing.offeringTitle}`,
      heading: `${timing.offeringTitle} is now open`,
      introduction:
        "Your registration reserved a place, but it did not unlock the lessons. Complete tuition to access the class.",
    };
  }

  const interval =
    timing.daysUntilStart === 1 ? "tomorrow" : `in ${timing.daysUntilStart} days`;
  return {
    eyebrow: "Enrollment reminder",
    subject: `${timing.offeringTitle} starts ${interval}: complete tuition`,
    heading: `Your class starts ${interval}`,
    introduction: `Your place is reserved for ${timing.offeringTitle}. Complete tuition before ${timing.startDateLabel} so your lessons unlock when the class opens.`,
  };
}

export function buildPaymentReminderEmail(input: PaymentReminderEmailInput): PaymentReminderEmail {
  const copy = timingCopy(input.timing);
  const firstName = input.fullName.trim().split(/\s+/)[0] || "Student";
  const amount = tuition(input.amount, input.currency);
  const text = [
    `Hello ${firstName},`,
    "",
    copy.heading,
    copy.introduction,
    "",
    `Tuition due: ${amount}`,
    `Class date: ${input.timing.startDateLabel}`,
    "",
    `Complete payment or apply an approved full-tuition code: ${input.dashboardUrl}`,
    `Need tuition assistance? Apply for a scholarship: ${input.scholarshipUrl}`,
    "",
    "Once Stripe or KTI staff confirms full payment or a valid full-tuition code, class access updates automatically.",
    "",
    "KingsWord Training Institute",
  ].join("\n");

  const safe = {
    firstName: escapeHtml(firstName),
    eyebrow: escapeHtml(copy.eyebrow),
    heading: escapeHtml(copy.heading),
    introduction: escapeHtml(copy.introduction),
    amount: escapeHtml(amount),
    date: escapeHtml(input.timing.startDateLabel),
    dashboardUrl: escapeHtml(input.dashboardUrl),
    scholarshipUrl: escapeHtml(input.scholarshipUrl),
  };

  return {
    subject: copy.subject,
    text,
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4efe3;color:#102642;font-family:Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Payment is required before class access unlocks.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4efe3;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;overflow:hidden;border:1px solid #dec780;border-radius:22px;background:#fffdf7;">
          <tr><td bgcolor="#082848" style="padding:34px 38px;background-color:#082848;background-image:linear-gradient(135deg,#082848,#164f7b);color:#fffdf7;">
            <div style="margin-bottom:14px;color:#e4c46f;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">${safe.eyebrow}</div>
            <h1 style="margin:0;font-family:Georgia,serif;font-size:34px;line-height:1.08;font-weight:500;">${safe.heading}</h1>
          </td></tr>
          <tr><td style="padding:34px 38px;">
            <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Hello ${safe.firstName},</p>
            <p style="margin:0 0 24px;color:#42536a;font-size:16px;line-height:1.7;">${safe.introduction}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 26px;border:1px solid #e5dcc6;border-radius:14px;background:#f8f3e8;">
              <tr><td style="padding:18px 20px;border-bottom:1px solid #e5dcc6;color:#657184;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Tuition due</td><td align="right" style="padding:18px 20px;border-bottom:1px solid #e5dcc6;font-size:17px;font-weight:700;">${safe.amount}</td></tr>
              <tr><td style="padding:18px 20px;color:#657184;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Class date</td><td align="right" style="padding:18px 20px;font-size:15px;font-weight:700;">${safe.date}</td></tr>
            </table>
            <a href="${safe.dashboardUrl}" style="display:block;padding:15px 20px;border-radius:10px;background:#dfb64f;color:#102642;font-size:15px;font-weight:700;text-align:center;text-decoration:none;">Complete tuition</a>
            <p style="margin:20px 0 0;color:#657184;font-size:13px;line-height:1.65;text-align:center;">Have an approved full-tuition code? Enter it on the payment screen. Once confirmed, no payment is collected.</p>
            <p style="margin:18px 0 0;padding-top:18px;border-top:1px solid #e5dcc6;color:#657184;font-size:13px;line-height:1.65;text-align:center;">Unable to afford tuition? <a href="${safe.scholarshipUrl}" style="color:#144c78;font-weight:700;">Apply for a scholarship</a>.</p>
          </td></tr>
          <tr><td style="padding:22px 38px;background:#0b223d;color:#b9c4d0;font-size:12px;line-height:1.6;text-align:center;">KingsWord Training Institute<br><a href="https://www.thekti.org" style="color:#e4c46f;text-decoration:none;">www.thekti.org</a></td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}
