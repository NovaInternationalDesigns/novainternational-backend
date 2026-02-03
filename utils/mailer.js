import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

export const sendWelcomeEmail = async (email, name) => {
  try {
    await transporter.sendMail({
      from: `"Nova International" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Welcome!",
      html: `<p>Hello <strong>${name}</strong>, welcome to Nova International!</p>`,
    });
    console.log("✅ Email sent to", email);
  } catch (err) {
    console.error("❌ Email error:", err);
  }
};
