// backend/routes/auth.js
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const pool = require("../config/db");

const router = express.Router();
const JWT_SECRET = "your_super_secret_key_123";

router.post("/login", async (req, res) => {
  let { username, password, isGuest } = req.body;
  try {
    if (isGuest) {
      username = `guest_${Math.floor(100000 + Math.random() * 900000)}`;
      const insertResult = await pool.query(
        "INSERT INTO users (username, is_guest) VALUES ($1, $2) RETURNING *",
        [username, true],
      );
      const user = insertResult.rows[0];
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: "24h" },
      );
      return res.json({
        message: "游客登录成功",
        token,
        user: { id: user.id, username: user.username },
      });
    }

    username = username.trim();
    if (!username || !/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,15}$/.test(username))
      return res.status(400).json({
        errorCode: "ERR_INVALID_USERNAME",
        error: "用户名必须是2-15位的中英文、数字或下划线！",
      });

    if (username.toLowerCase().startsWith("guest_"))
      return res.status(400).json({
        errorCode: "ERR_GUEST_PREFIX",
        error: "不可以冒充游客，请勿使用 guest_ 开头的用户名！",
      });

    let result = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    let user = result.rows[0];

    if (!user) {
      if (!password || password.length < 4)
        return res.status(400).json({
          errorCode: "ERR_PWD_TOO_SHORT",
          error: "新用户注册失败：请提供至少4位数的密码！",
        });

      const hash = await bcrypt.hash(password, 10);
      const insertResult = await pool.query(
        "INSERT INTO users (username, password_hash, is_guest) VALUES ($1, $2, $3) RETURNING *",
        [username, hash, false],
      );
      user = insertResult.rows[0];
    } else {
      if (user.is_guest)
        return res.status(401).json({
          errorCode: "ERR_GUEST_TAKEN",
          args: { user: username },
          error: `"${username}" 是系统生成的游客名，无法被注册或登录！`,
        });

      if (!password)
        return res.status(401).json({
          errorCode: "ERR_USER_EXISTS",
          args: { user: username },
          error: `用户名 "${username}" 已存在，请输入密码登录！`,
        });

      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid)
        return res.status(401).json({
          errorCode: "ERR_PWD_INCORRECT",
          error: "密码错误！请重新输入。",
        });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "24h" },
    );
    res.json({
      message: "登录成功",
      token,
      user: { id: user.id, username: user.username },
    });
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({
        errorCode: "ERR_USERNAME_TAKEN",
        error: "系统异常：该用户名已被占用",
      });
    res.status(500).json({
      errorCode: "ERR_SERVER_ERROR",
      error: "服务器内部错误，请检查数据库状态",
    });
  }
});

module.exports = router;
