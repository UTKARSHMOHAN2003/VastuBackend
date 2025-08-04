const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const userModel = require("../model/userModel");

exports.login = async (req, res) => {
  const { username, password } = req.body;

  const user = await userModel.getUserByUsername(username);
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const isMatch = password === user.password_hash;
  if (!isMatch) {
    return res.status(401).json({
      message: "Invalid credentials",
      username: username,
      password: password,
    });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({ token });
};
