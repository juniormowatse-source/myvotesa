import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import multer from 'multer';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

// PRIORITY 13: CRITICAL ENVIRONMENT GUARDRAILS
if (!process.env.MONGO_URI || !process.env.ID_SALT) {
    console.error('\x1b[31m%s\x1b[0m', '❌ CRITICAL CONFIGURATION FAULT: MONGO_URI and ID_SALT must be defined.');
    console.error('Ledger initialization process aborted to protect cryptographic signing integrity.');
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;
const ID_SALT = process.env.ID_SALT;
const MONGO_URI = process.env.MONGO_URI;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/assets', express.static(path.resolve('assets')));

// PRIORITY 2: TRANSACTION NODE RATE LIMITER (10 Requests per 15-Min Window per Node IP)
const transactionRateLimitMap = new Map();
const LIMIT_WINDOW = 15 * 60 * 1000; 
const MAX_LIMIT = 10;

function ledgerRateLimiter(req, res, next) {
    const nodeIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const currentTime = Date.now();
    
    if (!transactionRateLimitMap.has(nodeIp)) {
        transactionRateLimitMap.set(nodeIp, []);
    }
    
    let accessTimestamps = transactionRateLimitMap.get(nodeIp).filter(time => currentTime - time < LIMIT_WINDOW);
    
    if (accessTimestamps.length >= MAX_LIMIT) {
        return res.status(429).json({ 
            error: "Rate limit breached. Excessive block generation requests from this client connection node." 
        });
    }
    
    accessTimestamps.push(currentTime);
    transactionRateLimitMap.set(nodeIp, accessTimestamps);
    next();
}

app.get('/', (req, res) => {
    res.sendFile(path.resolve('index.html'));
});

const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images and videos allowed'), false);
        }
    }
});

mongoose.connect(MONGO_URI)
  .then(() => console.log('✓ Connected cleanly to Ledger Primary database.'))
  .catch(err => console.error('Critical Database connection failure:', err));

const reportSchema = new mongoose.Schema({
    ticketId: { type: String, required: true, unique: true },
    citizen_name: { type: String, required: true },
    citizen_id_hashed: { type: String, required: true },
    sector: { 
        type: String, 
        enum: ['saps','health','water','electricity','roads','parks','libraries','waste','sewage'], 
        required: true 
    },
    province: { type: String, required: true },
    municipality: { type: String, required: true },
    ward: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    description: { type: String, required: true, minlength: 10 },
    evidence_hash: { type: String, default: null },
    constitutionalAnchors: [{ type: String }],
    coSignaturesRequired: { type: Number, default: 5 },
    coSignatures: { type: Array, default: [] },
    status: { type: String, default: 'awaiting-community-verification' },
    accountabilityScore: { type: Number, default: 100 },
    createdAt: { type: Date, default: Date.now }
}, { collection: 'reports' });

const Report = mongoose.model('Report', reportSchema);

function assignConstitutionalAnchors(sector) {
    switch (sector) {
        case 'saps':
            return ["Section 12: Freedom from Violence", "SAPS Act Compliance"];
        case 'health':
            return ["Section 27: Right to Health Care Services", "National Health Act"];
        case 'water':
            return ["Section 27: Right to Sufficient Water"];
        case 'sewage':
        case 'waste':
            return ["Section 24: Environment (Right to Health & Well-being)", "Section 152: Municipal Service Delivery Obligations"];
        case 'electricity':
        case 'roads':
            return ["Section 152: Objects of Local Government (Infrastructure Delivery Failure)"];
        case 'parks':
        case 'libraries':
            return ["Section 152: Objects of Local Government (Community Amenities & Social Infrastructure)"];
        default:
            return ["Section 195: Basic Values Governing Public Administration"];
    }
}

// Mounted Rate Limiting Protection directly onto the Write pipeline
app.post('/api/reports', ledgerRateLimiter, (req, res, next) => {
    upload.single('evidence')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        next();
    });
}, async (req, res) => {
    try {
        const { firstName, surname, idNumber, sector, rating, description, province, municipality, ward } = req.body;

        if (!firstName || !surname || !idNumber || !sector || !rating || !description || !province || !municipality || !ward) {
            return res.status(400).json({ error: "Missing required fields in payload transaction." });
        }
        if (idNumber.length !== 13 || !/^\d{13}$/.test(idNumber)) {
            return res.status(400).json({ error: "Invalid South African Identification document layout." });
        }

        const citizenIdHashed = crypto
            .createHash('sha256')
            .update(idNumber + ID_SALT)
            .digest('hex');

        let evidenceHash = null;
        if (req.file) {
            evidenceHash = crypto
                .createHash('sha256')
                .update(req.file.buffer)
                .digest('hex');
        }

        const timestampMarker = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const uniqueNoise = crypto.randomBytes(3).toString('hex').toUpperCase();
        const ticketId = `TKT-${timestampMarker}-${uniqueNoise}`;

        const constitutionalAnchors = assignConstitutionalAnchors(sector);

        const finalLedgerEntry = new Report({
            ticketId,
            citizen_name: `${firstName.trim()} ${surname.trim()}`,
            citizen_id_hashed: citizenIdHashed,
            sector,
            province: province.trim(),
            municipality: municipality.trim(),
            ward: ward.trim(),
            rating: parseInt(rating, 10),
            description: description.trim(),
            evidence_hash: evidenceHash,
            constitutionalAnchors
        });

        await finalLedgerEntry.save();

        return res.status(201).json({
            success: true,
            ticketId: ticketId,
            message: "Report committed flawlessly directly into the public ledger.",
            anchors: constitutionalAnchors,
            location: `Ward ${ward.trim()}, ${municipality.trim()}, ${province.trim()}`
        });

    } catch (error) {
        console.error("Critical submission failure encountered on ledger write:", error);
        return res.status(500).json({ error: "Internal ledger processing crash occurred during block execution." });
    }
});

app.listen(PORT, () => {
    console.log(`Ward Civic Ledger Engine active on target network interface port: ${PORT}`);
});