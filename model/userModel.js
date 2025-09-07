const { getConnection, sql } = require("../config/db");

/**
 * Fetch user by username
 * @param {string} username
 * @returns {Promise<Object|null>}
 */
const getUserByUsername = async (username) => {
  try {
    const pool = await getConnection();
    const request = pool.request();
    request.input("username", sql.NVarChar, username);

    const result = await request.query(`
      SELECT id, username, password_hash, role
      FROM users2
      WHERE username = @username
    `);

    return result.recordset[0] || null;
  } catch (err) {
    console.error("❌ Error in getUserByUsername:", err);
    throw err;
  }
};

module.exports = {
  getUserByUsername,
};
