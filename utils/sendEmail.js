import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Create transporter for GoDaddy SMTP
const transporter = nodemailer.createTransport({
    host: "smtpout.secureserver.net",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER, // e.g., info@novainternationaldesigns.com
        pass: process.env.EMAIL_PASS, // App password or actual password
    },
});

// Optional: Verify SMTP connection
transporter.verify((error, success) => {
    if (error) {
        console.error("❌ SMTP connection error:", error);
    } else {
        console.log("✅ SMTP server ready to send emails");
    }
});

/**
 * Generic send email function
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} text - Plain text or HTML string
 * @param {boolean} isHtml - Optional, set to true if content is HTML
 */
const sendEmail = async (to, subject, text, isHtml = false) => {
    try {
        const info = await transporter.sendMail({
            from: `"Nova International" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            [isHtml ? "html" : "text"]: text,
        });
        console.log(`✅ Email sent to ${to}: ${info.messageId}`);
        return true;
    } catch (err) {
        console.error(`❌ Failed to send email to ${to}:`, err.message);
        return false;
    }
};

export default sendEmail;