import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import multer from 'multer';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const ID_SALT = process.env.ID_SALT || 'MzI1OTYyMTU0Nzg5U0FfQ0lWSUNfTEVER0VS';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/my_vote_sa';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// MongoDB Document Schema Architecture with Geopolitical Fragmentation
const reportSchema = new mongoose.Schema({
    ticketId: { type: String, required: true, unique: true },
    citizen_name: { type: String, required: true },
    citizen_id_hashed: { type: String, required: true },
    sector: { type: String, enum: ['saps','health','water','electricity','roads'], required: true },
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
            return ["Section 27: Right to Sufficient Water & Sanitation"];
        case 'electricity':
        case 'roads':
            return ["Section 152: Objects of Local Government (Service Delivery Failure)"];
        default:
            return ["Section 195: Basic Values Governing Public Administration"];
    }
}

app.post('/api/reports', (req, res, next) => {
    upload.single('evidence')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        next();
    });
}, async (req, res) => {
    try {
        const { firstName, surname, idNumber, sector, rating, description, province, municipality, ward } = req.body;

        // Validation Fallbacks including structural localization strings
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
            location: `${ward.trim()}, ${municipality.trim()}, ${province.trim()}`
        });

    } catch (error) {
        console.error("Critical submission failure encountered on ledger write:", error);
        return res.status(500).json({ error: "Internal ledger processing crash occurred during block execution." });
    }
});

app.listen(PORT, () => {
    console.log(`Ward Civic Ledger Engine active on target network interface port: ${PORT}`);
});