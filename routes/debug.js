import express from "express";
import { testSmtp } from "../utils/mailer.js";

const router = express.Router();

// GET /api/debug/smtp-test?to=you@domain.com
router.get("/smtp-test", async (req, res) => {
    const to = req.query.to || null;
    try {
        const result = await testSmtp(to);
        if (result.ok) return res.json({ ok: true, sent: !!to });
        return res.status(500).json({ ok: false, error: result.error });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

export default router;
