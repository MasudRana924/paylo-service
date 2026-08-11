require('dotenv').config();
const express = require('express');
const routes = require("./src/routes");
const cors = require('cors');
const { connectDB } = require("./src/config/db");

connectDB();

const app = express();
app.use(cors(
  {
    allowOrigin: '*'
  }
));

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
