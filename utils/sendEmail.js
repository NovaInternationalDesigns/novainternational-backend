import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();


const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true" ? true : false, // false for TLS 587, true for SSL 465
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// Optional but VERY helpful for debugging
transporter.verify((error, success) => {
    if (error) {
        console.error("SMTP connection error:", error);
    } else {
        console.log("SMTP server ready to send emails");
    }
});

const sendEmail = async (to, subject, text) => {
    const info = await transporter.sendMail({
        from: `"Nova International" <${process.env.SMTP_USER}>`,
        to,
        subject,
        text
    });

    console.log("Email sent:", info.messageId);
};

export default sendEmail;
