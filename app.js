const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB } = require('./config/db');


const imageRoutes = require('./routes/imageRoutes');

// Load environment variables
require('dotenv').config();

// Initialize express app
const app = express();

// Connect to database and initialize tables
const setupDatabase = async () => {
  await connectDB();

};

setupDatabase().catch(err => {
  console.error('Failed to setup database:', err);
  process.exit(1);
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/images', imageRoutes);

// Basic route for testing
app.get('/', (req, res) => {
  res.send('API is running...');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ message: 'Something went wrong!', error: err.message });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});