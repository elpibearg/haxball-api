import express from "express";
import pkg from "pg";
import crypto from "crypto";

const { Pool } = pkg;

const app = express();
app.use(express.json());

/* =========================
   PostgreSQL connection
========================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("render.com")
    ? { rejectUnauthorized: false }
    : false,
});

/* =========================
   Init DB (safe to run always)
========================= */
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS codes (
      id SERIAL PRIMARY KEY,
      discord_id TEXT NOT NULL,
      code TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_codes_discord_id
      ON codes(discord_id);

    CREATE INDEX IF NOT EXISTS idx_codes_expires_at
      ON codes(expires_at);
  `);
}

initDB().catch(console.error);

/* =========================
   Helpers
========================= */
function generateCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

/* =========================
   Health check
========================= */
app.get("/", (_req, res) => {
  res.json({
    status: "API OK",
    time: new Date().toISOString(),
  });
});

/* =========================
   Generate code
========================= */
app.post("/generate-code", async (req, res) => {
  try {
    const { discordId } = req.body;

    if (!discordId) {
      return res.status(400).json({ error: "discordId required" });
    }

    // Clean expired codes
    await pool.query(
      `DELETE FROM codes WHERE expires_at < NOW()`
    );

    // Check active (non-expired) code
    const existing = await pool.query(
      `
      SELECT code, expires_at
      FROM codes
      WHERE discord_id = $1
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [discordId]
    );

    if (existing.rows.length > 0) {
      const { code, expires_at } = existing.rows[0];
      return res.json({
        code,
        expiresAt: expires_at,
        reused: true,
      });
    }

    // Create new code (valid 10 minutes)
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `
      INSERT INTO codes (discord_id, code, expires_at)
      VALUES ($1, $2, $3)
      `,
      [discordId, code, expiresAt]
    );

    res.json({
      code,
      expiresAt,
      reused: false,
    });
  } catch (err) {
    console.error("API ERROR:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/* =========================
   Start server
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
