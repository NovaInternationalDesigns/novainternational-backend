import express from "express";
import registerRouter from "./auth/register.js";
import loginRouter from "./auth/login.js";
import meRouter from "./auth/me.js";

const router = express.Router();

// Mount sub-routes
router.use("/register", registerRouter);
router.use("/login", loginRouter);
router.use("/me", meRouter);

export default router;
