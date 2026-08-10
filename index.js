require('dotenv').config();
const express = require('express');
const routes = require("./src/routes");
const { connectDB } = require("./src/config/db");
const { connectRedis } = require("./src/config/redis");

connectDB();
connectRedis();

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Apply routes
app.use('/api/v1', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ errorMessage: "Not Found" });
});

app.listen(8080, () => {
  console.log("Server is running on port 8080");
});
