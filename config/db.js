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
  // Don't exit in serverless environment, just log the error
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
}

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.SERVER,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT) || 1433,
  options: {
    encrypt: true, // Use encryption (required for Azure SQL)
    trustServerCertificate: process.env.SERVER && process.env.SERVER.includes('database.windows.net') ? false : true,
    enableArithAbort: true,
    connectTimeout: 30000, // 30 seconds
    requestTimeout: 30000, // 30 seconds
    connectionRetryInterval: 2000, // 2 seconds
    maxRetriesOnFailure: 3,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
  },
};

// Log config (without sensitive data) for debugging
console.log("Database config:", {
  user: config.user,
  server: config.server,
  database: config.database,
  port: config.port,
  serverType: typeof config.server,
});

// Global connection pool - will be created on first use
let pool = null;

// Create connection pool with retry logic
const createPool = async () => {
  if (pool && pool.connected) {
    return pool;
  }

  try {
    pool = new sql.ConnectionPool(config);
    
    // Global error handler for database connection
    pool.on("error", (err) => {
      console.error("Database pool error:", err);
      pool = null; // Reset pool on error
    });

    await pool.connect();
    console.log("✅ Connected to SQL Server -", process.env.DB_NAME);
    return pool;
  } catch (err) {
    console.error("❌ Database connection error:", {
      message: err.message,
      code: err.code,
      state: err.state,
      originalError: err.originalError,
    });
    pool = null;
    throw err;
  }
};

// Get database connection with retry logic
const getConnection = async () => {
  try {
    if (!pool || !pool.connected) {
      await createPool();
    }
    return pool;
  } catch (err) {
    console.error("Failed to get database connection:", err);
    throw err;
  }
};

// Test database connection
const testConnection = async () => {
  try {
    const connection = await getConnection();
    const result = await connection.request().query("SELECT 1 as test");
    if (result) {
      console.log("Database query test successful");
      return true;
    }
  } catch (err) {
    console.error("Database test query failed:", err);
    return false;
  }
};

// Connect to database (for server startup)
const connectDB = async () => {
  try {
    await testConnection();
  } catch (err) {
    console.error("Failed to setup database:", err);
    // Don't exit in production/serverless environment
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
};

module.exports = {
  getConnection,
  sql,
  connectDB,
  testConnection,
};
