// config/db.js
const sql = require("mssql");
const path = require("path");
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['DB_USER', 'DB_PASSWORD', 'SERVER', 'DB_NAME'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error("❌ Missing required environment variables:", missingVars);
  console.error("Please check your .env file and ensure all required variables are set.");
  process.exit(1);
}

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.SERVER, // This must be a string like "localhost" or "your-server.database.windows.net"
  database: process.env.DB_NAME,
  options: {
    encrypt: true, // Use encryption (required for Azure SQL)
    trustServerCertificate: process.env.SERVER.includes('database.windows.net') ? false : true, // Trust cert for local, not for Azure
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  connectionTimeout: 15000, // 15 seconds
  requestTimeout: 15000, // 15 seconds
};

// Log config (without sensitive data) for debugging
console.log("Database config:", {
  user: config.user,
  server: config.server,
  database: config.database,
  serverType: typeof config.server,
});

// Create connection pool
const pool = new sql.ConnectionPool(config);

// Global error handler for database connection
pool.on("error", (err) => {
  console.error("Database pool error:", err);
});

const connectDB = async () => {
  try {
    await pool.connect();
    console.log("✅ Connected to SQL Server -", process.env.DB_NAME);

    // Verify database connection with test query
    const result = await pool.request().query("SELECT 1 as test");
    if (result) {
      console.log("Database query test successful");
    }
  } catch (err) {
    console.error("❌ Database connection error:", {
      message: err.message,
      code: err.code,
      state: err.state,
      originalError: err.originalError,
    });
    process.exit(1); // Exit if database connection fails
  }
};

module.exports = {
  pool,
  sql,
  connectDB,
};