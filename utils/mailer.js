import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendWelcomeEmail = async (email, name) => {
  try {
    await transporter.sendMail({
      from: `"Nova International" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Welcome to Nova International!",
      text: `Hi ${name}, welcome to Nova International!`,
      html: `<p>Hi <strong>${name}</strong>, welcome to Nova International!</p>`,
    });
    console.log("✅ Welcome email sent to", email);
  } catch (err) {
    console.error("❌ Email sending error:", err);
  }
};
