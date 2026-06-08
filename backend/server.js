import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import healthRoutes from './routes/health.js';
import reportsRoutes from './routes/reports.js';
// 1. ADD THIS IMPORT LINE HERE:
import { errorHandler } from './middleware/errorHandler.js'; 

const app = express();

// Global Middleware
app.use(cors());
app.use(express.json()); // Parses incoming JSON payloads safely

// Database Connection Validation
const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
    console.error("❌ Error: MONGO_URI environment variable is missing on Render!");
    process.exit(1);
}

// Connect to your live MongoDB Atlas Cluster
mongoose.connect(mongoURI)
    .then(() => console.log("🔌 Connected successfully to MongoDB Atlas Cluster0"))
    .catch((err) => console.error("❌ MongoDB connection error:", err));

// Register Server Routes to match your directory files
app.use('/api/auth', authRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/reports', reportsRoutes);

// Base Health Check Route (Helps Render monitor app stability)
app.get('/', (req, res) => {
    res.status(200).json({ status: "Backend server running smoothly" });
});

// 2. ADD THIS MIDDLEWARE REGISTER LINE HERE (Right before app.listen):
app.use(errorHandler); 

// Dynamic Port Binding for Render Cloud Environment
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server is listening dynamically on port ${PORT}`);
});