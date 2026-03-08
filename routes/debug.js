import express from "express";
import nodemailer from "nodemailer";

const router = express.Router();

// GET /api/debug/smtp-test?to=you@domain.com
router.get("/smtp-test", async (req, res) => {
    const to = req.query.to || null;
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!user || !pass) {
        return res.status(500).json({
            ok: false,
            error: "EMAIL_USER or EMAIL_PASS is missing in environment",
        });
    }

    const transporter = nodemailer.createTransport({
        host: "outlook.office365.com",
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user, pass },
        tls: { minVersion: "TLSv1.2" },
    });

    try {
        await transporter.verify();

        if (to) {
            await transporter.sendMail({
                from: `"Nova International Designs" <${user}>`,
                to,
                subject: "SMTP Test from Render",
                text: "SMTP is working from deployed backend.",
            });
        }

        return res.json({ ok: true, verified: true, sent: !!to });
    } catch (err) {
        return res.status(500).json({
            ok: false,
            error: err?.message || String(err),
            code: err?.code,
            responseCode: err?.responseCode,
        });
    }
});

export default router;
