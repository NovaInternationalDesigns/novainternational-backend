import 'dotenv/config'; // automatically loads .env
import nodemailer from 'nodemailer';

async function testEmail() {
  const transporter = nodemailer.createTransport({
    host: "smtpout.secureserver.net",
    port: 465,
    secure: true, // SSL
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // use app password if 2FA is on
    },
    logger: true,
    debug: true
  });

  try {
    await transporter.verify();
    console.log("✅ SMTP credentials are valid! You can send emails.");
  } catch (err) {
    console.error("❌ SMTP authentication failed:", err.message);
  }
}

testEmail();