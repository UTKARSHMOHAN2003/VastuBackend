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
    encrypt: true, // Required for Azure SQL and most cloud providers
    trustServerCertificate: false, // Set to false for production security
    enableArithAbort: true,
    connectTimeout: 60000, // Increased to 60 seconds
    requestTimeout: 60000, // Increased to 60 seconds
    connectionRetryInterval: 3000, // 3 seconds
    maxRetriesOnFailure: 5, // Increased retry attempts
    // Additional options for cloud connectivity
    enableAnsiNullDefault: true,
    enableAnsiNull: true,
    enableAnsiWarnings: true,
    enableConcatNullYieldsNull: true,
    enableCursorCloseOnCommit: true,
    enableImplicitTransactions: false,
    enableQuotedIdentifiers: true,
    enableAnsiPadding: true,
    // SSL/TLS options for better connectivity
    cryptoCredentialsDetails: {
      minVersion: 'TLSv1.2'
    }
  },
  pool: {
    max: 5, // Reduced for serverless
    min: 0,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 60000, // Increased timeout
    createTimeoutMillis: 60000, // Increased timeout
    destroyTimeoutMillis: 5000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 500, // Faster retry
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

// Alternative Azure SQL Database connection string method
const getAzureConnectionString = () => {
  if (process.env.AZURE_CONNECTION_STRING) {
    return process.env.AZURE_CONNECTION_STRING;
  }
  
  // Build connection string from individual components
  const server = process.env.SERVER;
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const port = process.env.DB_PORT || 1433;
  
  return `Server=${server},${port};Database=${database};User Id=${user};Password=${password};Encrypt=true;TrustServerCertificate=false;Connection Timeout=60;`;
};

// Global connection pool - will be created on first use
let pool = null;

// Create connection pool with retry logic
const createPool = async (retryCount = 0) => {
  if (pool && pool.connected) {
    return pool;
  }

  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  try {
    console.log(`Attempting to connect to SQL Server (attempt ${retryCount + 1}/${maxRetries + 1})...`);
    
    // Try connection string method first (better for Azure SQL)
    if (retryCount === 0 && process.env.AZURE_CONNECTION_STRING) {
      console.log("Trying Azure connection string method...");
      pool = new sql.ConnectionPool(process.env.AZURE_CONNECTION_STRING);
    } else {
      console.log("Trying config object method...");
      pool = new sql.ConnectionPool(config);
    }
    
    // Global error handler for database connection
    pool.on("error", (err) => {
      console.error("Database pool error:", err);
      pool = null; // Reset pool on error
    });

    await pool.connect();
    console.log("✅ Connected to SQL Server -", process.env.DB_NAME);
    return pool;
  } catch (err) {
    console.error(`❌ Database connection error (attempt ${retryCount + 1}):`, {
      message: err.message,
      code: err.code,
      state: err.state,
      originalError: err.originalError,
    });
    
    pool = null;
    
    // Retry logic for ESOCKET and connection errors
    if (retryCount < maxRetries && (err.code === 'ESOCKET' || err.code === 'ETIMEOUT' || err.code === 'ECONNREFUSED')) {
      console.log(`Retrying connection in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return createPool(retryCount + 1);
    }
    
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
  getAzureConnectionString,
};
