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

// Enhanced configuration with environment-specific settings
const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.SERVER,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT) || 1433,
  options: {
    // Environment-specific encryption settings
    encrypt: !isDevelopment, // Disable encryption in development, enable in production
    trustServerCertificate: true, // Always trust for now to avoid cert issues
    enableArithAbort: true,
    // Increased timeouts for production environment
    connectTimeout: isDevelopment ? 15000 : 60000, // 15s dev, 60s prod
    requestTimeout: isDevelopment ? 15000 : 60000,  // 15s dev, 60s prod
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// Enhanced logging with environment info
console.log("🔧 Database configuration:", {
  user: config.user,
  server: config.server,
  database: config.database,
  port: config.port,
  serverType: typeof config.server,
  environment: isDevelopment ? 'Development' : 'Production',
  encryption: config.options.encrypt ? 'Enabled' : 'Disabled',
  connectTimeout: config.options.connectTimeout + 'ms',
  requestTimeout: config.options.requestTimeout + 'ms'
});

// Create connection pool
const pool = new sql.ConnectionPool(config);

// Global error handler for database connection
pool.on("error", (err) => {
  console.error("❌ Database pool error:", err);
});

// Enhanced connection function with better error handling
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
    
    return pool;
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
    console.error("- Timeout:", config.options.connectTimeout + 'ms');
    
    // Don't exit immediately in development for debugging
    if (!isDevelopment) {
      process.exit(1);
    } else {
      console.log("⚠️ Development mode: Not exiting process for debugging");
      throw err;
    }
  }
};

module.exports = {
  pool,
  sql,
  connectDB,
};
