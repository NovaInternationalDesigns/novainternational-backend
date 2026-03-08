// scripts/emailTest.js
import "dotenv/config";
import nodemailer from "nodemailer";

// Destructure environment variables
const { EMAIL_USER, EMAIL_PASS, NODE_ENV } = process.env;

// Validate environment variables
if (!EMAIL_USER || !EMAIL_PASS) {
  console.error("❌ Missing EMAIL_USER or EMAIL_PASS in environment variables.");
  process.exit(1);
}

// Create a pooled SMTP transporter
const transporter = nodemailer.createTransport({
  host: "outlook.office365.com",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  tls: { minVersion: "TLSv1.2" },
  pool: true,          // reuse connections for multiple emails
  maxConnections: 5,
  maxMessages: 100,
  connectionTimeout: 20000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
  logger: NODE_ENV !== "production", // only log in dev
});

// Optional: verify SMTP only in development
async function verifySMTP() {
  if (NODE_ENV === "production") return;

  try {
    console.log("🔎 Verifying SMTP connection (dev only)...");
    await transporter.verify();
    console.log("✅ SMTP credentials are valid.");
  } catch (err) {
    console.warn("⚠ SMTP verification failed (ignored in dev):", err.message);
  }
}

// Function to send a test email with retry logic
async function sendTestEmail(to = EMAIL_USER) {
  const mailOptions = {
    from: `"Nova Test" <${EMAIL_USER}>`,
    to,
    subject: "✅ Nova International - SMTP Test",
    html: `<p>✅ Email system is working! Sent at ${new Date().toLocaleString()}</p>`,
  };

  const retries = 3;
  for (let i = 0; i < retries; i++) {
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log("✅ Test email sent successfully!");
      console.log("Message ID:", info.messageId);
      console.log(`📧 Check your inbox: ${to}`);
      return;
    } catch (err) {
      if (err.code === "ETIMEDOUT" && i < retries - 1) {
        console.warn(`⏳ Timeout, retrying (${i + 1}/${retries})...`);
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        console.error("❌ Failed to send test email:", err.message);
        return;
      }
    }
  }
}

// Main execution
(async () => {
  await verifySMTP();
  await sendTestEmail();
})();