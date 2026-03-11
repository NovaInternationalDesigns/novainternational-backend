import "dotenv/config";
import nodemailer from "nodemailer";

async function emailTest() {
  const { SMTP_USER, SMTP_PASS } = process.env;
  const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
  const SMTP_HOST = process.env.SMTP_HOST || "smtp.office365.com";
  const SMTP_FALLBACK_HOST = process.env.SMTP_FALLBACK_HOST || "outlook.office365.com";
  const SMTP_EXTRA_FALLBACK_HOST =
    process.env.SMTP_EXTRA_FALLBACK_HOST || "smtp-mail.outlook.com";

  // Validate environment variables
  if (!SMTP_USER || !SMTP_PASS) {
    console.error("❌ Missing SMTP_USER or SMTP_PASS in environment variables.");
    process.exit(1);
  }

  const hosts = [SMTP_HOST, SMTP_FALLBACK_HOST, SMTP_EXTRA_FALLBACK_HOST].filter(
    (host, index, arr) => host && arr.indexOf(host) === index
  );

  const createTransport = (host) =>
    nodemailer.createTransport({
      host,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      requireTLS: SMTP_PORT !== 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: {
        minVersion: "TLSv1.2",
      },
      connectionTimeout: 30000,
      greetingTimeout: 20000,
      socketTimeout: 30000,
      logger: true,
    });

  try {
    console.log("🔎 Verifying SMTP connection...");

    let verified = false;
    for (const host of hosts) {
      try {
        const transporter = createTransport(host);
        await transporter.verify();
        console.log(`✅ SMTP verified using ${host}:${SMTP_PORT}`);
        verified = true;
        break;
      } catch (err) {
        console.warn(`⚠ Verify failed on ${host}:${SMTP_PORT} ->`, err?.message || err);
      }
    }

    if (!verified) {
      throw new Error("SMTP verification failed on all configured hosts.");
    }

    console.log("✅ SMTP credentials are valid. Email service is ready.");
  } catch (error) {
    console.error("❌ SMTP verification failed.");
    console.error("Message:", error?.message);
    console.error("Code:", error?.code || "N/A");
  } finally {
    process.exit();
  }
}

emailTest();