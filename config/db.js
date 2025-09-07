// config/db.js
const sql = require("mssql");
const path = require("path");
require('dotenv').config();

// Environment check
const isDevelopment = process.env.NODE_ENV === 'development';
console.log(`🔧 Running in ${isDevelopment ? 'Development' : 'Production'} mode`);

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
  server: process.env.SERVER,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT) || 1433,
  options: {
    encrypt: false, // Try without encryption first
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  // Force longer timeouts
  connectionTimeout: 60000, // 60 seconds
  requestTimeout: 60000, // 60 seconds
};

// Log config (without sensitive data) for debugging
console.log("🔧 Database configuration:", {
  user: config.user,
  server: config.server,
  database: config.database,
  port: config.port,
  serverType: typeof config.server,
  environment: isDevelopment ? 'Development' : 'Production',
  encryption: config.options.encrypt ? 'Enabled' : 'Disabled',
  connectionTimeout: config.connectionTimeout + 'ms',
  requestTimeout: config.requestTimeout + 'ms'
});

// Create connection pool
const pool = new sql.ConnectionPool(config);

// Global error handler for database connection
pool.on("error", (err) => {
  console.error("❌ Database pool error:", err);
});

const connectDB = async () => {
  try {
    console.log("🔄 Attempting database connection...");
    console.log(`📡 Connecting to ${config.server}:${config.port}...`);
    
    await pool.connect();
    console.log("✅ Connected to SQL Server -", process.env.DB_NAME);
    
    // Verify database connection with test query
    const result = await pool.request().query("SELECT 1 as test, GETDATE() as currentTime");
    if (result && result.recordset && result.recordset.length > 0) {
      console.log("✅ Database query test successful");
      console.log("🕒 Server time:", result.recordset[0].currentTime);
    }
    
  } catch (err) {
    console.error("❌ Database connection error:", {
      message: err.message,
      code: err.code,
      state: err.state,
      severity: err.severity,
      number: err.number,
      originalError: err.originalError,
    });
    
    // Additional troubleshooting info
    console.error("🔍 Connection troubleshooting:");
    console.error("- Server:", config.server);
    console.error("- Port:", config.port);
    console.error("- Database:", config.database);
    console.error("- Encryption:", config.options.encrypt ? 'ON' : 'OFF');
    console.error("- Connection Timeout:", config.connectionTimeout + 'ms');
    console.error("- Request Timeout:", config.requestTimeout + 'ms');
    
    console.log("💡 Suggestions:");
    console.log("1. Check if the database server allows external connections");
    console.log("2. Verify firewall settings allow connections from Render IPs");
    console.log("3. Try using the Azure SQL server instead");
    
    // In production, continue without database for now
    if (!isDevelopment) {
      console.log("⚠️ Production: Continuing without database connection");
    } else {
      process.exit(1);
    }
  }
};

module.exports = {
  pool,
  sql,
  connectDB,
};
