import express from "express";
import bcrypt from "bcryptjs";
import User from "../../models/User.js";
import { sendWelcomeEmail } from "../../utils/mailer.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    req.session.userId = user._id;

    // Send welcome email asynchronously (errors won't block signup)
    sendWelcomeEmail(email, name);

    res.status(201).json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
