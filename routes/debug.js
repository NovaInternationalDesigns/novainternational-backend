import express from "express";
import nodemailer from "nodemailer";

const router = express.Router();

/**
 * GET /api/debug/smtp-test?to=email@example.com
 * Verifies SMTP connection (dev only) and optionally sends a test email
 */
router.get("/smtp-test", async (req, res) => {
    try {
        const { to } = req.query;
        const { EMAIL_USER, EMAIL_PASS, NODE_ENV } = process.env;

        if (!EMAIL_USER || !EMAIL_PASS) {
            return res.status(500).json({
                ok: false,
                error: "Missing EMAIL_USER or EMAIL_PASS environment variables",
            });
        }

        // Create SMTP transporter with pooling
        const transporter = nodemailer.createTransport({
            host: "outlook.office365.com",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: { user: EMAIL_USER, pass: EMAIL_PASS },
            tls: { minVersion: "TLSv1.2" },
            pool: true,           // enable connection pooling
            maxConnections: 5,
            maxMessages: 100,
            connectionTimeout: 20000,
            greetingTimeout: 15000,
            socketTimeout: 20000,
            logger: NODE_ENV !== "production",
        });

        // Only verify SMTP in development
        if (NODE_ENV !== "production") {
            try {
                await transporter.verify();
                console.log("✅ SMTP credentials verified (dev only).");
            } catch (verifyErr) {
                console.warn("⚠ SMTP verification failed (ignored in dev):", verifyErr.message);
            }
        }

        let emailSent = false;

        // Send test email if "to" is provided
        if (to) {
            await transporter.sendMail({
                from: `"Nova International Designs" <${EMAIL_USER}>`,
                to,
                subject: "SMTP Test Email",
                text: "SMTP connection is working correctly from the deployed backend.",
            });
            emailSent = true;
        }

        return res.json({
            ok: true,
            verified: NODE_ENV === "production" ? "skipped" : true,
            emailSent,
            message: emailSent
                ? "SMTP verified and test email sent."
                : "SMTP verified successfully or skipped in production.",
        });
    } catch (error) {
        console.error("SMTP Test Error:", error);
        return res.status(500).json({
            ok: false,
            error: error?.message || "SMTP verification failed",
            code: error?.code || null,
            responseCode: error?.responseCode || null,
        });
    }
});

export default router;