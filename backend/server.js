import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Import your custom modular middleware components
import securityHeaders from './middleware/securityHeaders.js';
import errorHandler from './middleware/errorHandler.js';

// Import your custom modular route components
import authRoutes from './routes/auth.js';
import reportRoutes from './routes/reports.js';
import healthRoutes from './routes/health.js';

dotenv.config();

// Critical Environment Variable Guardrail
if (!process.env.MONGO_URI || !process.env.ID_SALT) {
    console.error('\x1b[31m%s\x1b[0m', '❌ CRITICAL CONFIGURATION FAULT: MONGO_URI and ID_SALT must be defined.');
    console.error('Ledger initialization process aborted to protect cryptographic signing integrity.');
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Apply Global Security Configurations
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static elements (Frontend UI and custom branding assets)
app.use('/assets', express.static(path.resolve('assets')));
app.use(express.static(path.resolve('')));

// Built-in Transaction Sliding Window Rate Limiter
const ipRateLimitMap = new Map();
const LIMIT_WINDOW = 15 * 60 * 1000; // 15 Minutes
const MAX_LIMIT = 10;

app.use((req, res, next) => {
    // Only rate-limit transactional POST actions to safeguard ledger integrity
    if (req.method === 'POST') {
        const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const now = Date.now();
        
        if (!ipRateLimitMap.has(clientIp)) {
            ipRateLimitMap.set(clientIp, []);
        }
        
        let timestamps = ipRateLimitMap.get(clientIp).filter(time => now - time < LIMIT_WINDOW);
        
        if (timestamps.length >= MAX_LIMIT) {
            return res.status(429).json({ 
                error: "Rate limit breached. Excessive block validation requests from this node connection." 
            });
        }
        
        timestamps.push(now);
        ipRateLimitMap.set(clientIp, timestamps);
    }
    next();
});

// Primary Database Routing Pipeline Linkages
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/health', healthRoutes);

// Server Root HTML Route Fallback
app.get('/', (req, res) => {
    res.sendFile(path.resolve('index.html'));
});

// Database Connectivity Orchestrator
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✓ Connected cleanly to Ledger Primary Database cluster.'))
  .catch(err => console.error('Critical Database connectivity engine fault:', err));

// Register Global Error Interceptor Pipeline
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`Ward Civic Ledger Engine active on target network interface port: ${PORT}`);
});