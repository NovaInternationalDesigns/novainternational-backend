import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Create transporter
const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false, // use TLS
  auth: {
    user: process.env.SMTP_USER,     // your domain email
    pass: process.env.SMTP_PASS,     // normal password or app password
  },
});

// Optional: Verify SMTP connection
transporter.verify((err, success) => {
  if (err) console.error("SMTP connection error:", err);
  else console.log("SMTP ready to send emails");
});

/**
 * Send a welcome email
 * @param {string} email - Recipient email
 * @param {string} name - Recipient name
 */
export const sendWelcomeEmail = async (email, name) => {
  try {
    await transporter.sendMail({
      from: `"Nova International" <${process.env.SMTP_USER}>`, // sender
      to: email,                                            // recipient
      subject: "Welcome to Nova International!",           // email subject
      html: `<p>Hello <strong>${name}</strong>, welcome to Nova International!</p>`, // email body
    });

    console.log("✅ Email sent to", email);
  } catch (err) {
    console.error("❌ Email error:", err);
  }
};
