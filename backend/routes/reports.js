// backend/routes/reports.js
import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import Report from '../models/Report.js'; // Ensure your path matches your schema file

const router = express.Router();
const ID_SALT = process.env.ID_SALT;

// Setup transient memory buffer allocation for file streams
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images and videos are permissible asset payloads.'), false);
        }
    }
});

/**
 * HELPER: Direct Constitutional Anchor Assignment Matrix
 */
function assignConstitutionalAnchors(sector) {
    switch (sector) {
        case 'saps': return ["Section 12: Freedom from Violence", "SAPS Act Compliance"];
        case 'health': return ["Section 27: Right to Health Care Services", "National Health Act"];
        case 'water': return ["Section 27: Right to Sufficient Water"];
        case 'sewage':
        case 'waste': return ["Section 24: Environment (Right to Health & Well-being)", "Section 152: Municipal Service Delivery Obligations"];
        case 'electricity':
        case 'roads': return ["Section 152: Objects of Local Government (Infrastructure Delivery Failure)"];
        case 'parks':
        case 'libraries': return ["Section 152: Objects of Local Government (Community Amenities & Social Infrastructure)"];
        default: return ["Section 195: Basic Values Governing Public Administration"];
    }
}

/* ==========================================================================
   PRIORITY 3: READ LAYER ENDPOINTS
   ========================================================================== */

/**
 * 🔓 ENDPOINT 1: GET /api/reports
 * Public Ledger Filter Engine (Supports province, municipality, sector, ward queries)
 */
router.get('/', async (req, res, next) => {
    try {
        const { province, municipality, sector, ward } = req.query;
        let queryFilter = {};

        if (province) queryFilter.province = String(province);
        if (municipality) queryFilter.municipality = String(municipality);
        if (sector) queryFilter.sector = String(sector);
        if (ward) queryFilter.ward = String(ward);

        // Fetch blocks sorted by newest record entry
        const publicLedger = await Report.find(queryFilter)
            .select('-citizen_id_hashed') // Explicitly strip identity hashes out of open directory sweeps
            .sort({ createdAt: -1 })
            .limit(100);

        return res.status(200).json({ success: true, count: publicLedger.length, ledger: publicLedger });
    } catch (error) {
        next(error);
    }
});

/**
 * 🔓 ENDPOINT 2: GET /api/reports/stats
 * Aggregation Analytics Dashboard Pipeline
 */
router.get('/stats', async (req, res, next) => {
    try {
        const statisticalAggregation = await Report.aggregate([
            {
                $group: {
                    _id: {
                        province: "$province",
                        municipality: "$municipality",
                        sector: "$sector"
                    },
                    totalIncidents: { $sum: 1 },
                    averageSeverityRating: { $avg: "$rating" }
                }
            },
            { $sort: { totalIncidents: -1 } }
        ]);

        return res.status(200).json({ success: true, metrics: statisticalAggregation });
    } catch (error) {
        next(error);
    }
});

/**
 * 🔓 ENDPOINT 3: GET /api/reports/:ticketId
 * Targeted Individual Block Audit Lookup
 */
router.get('/:ticketId', async (req, res, next) => {
    try {
        const { ticketId } = req.params;
        const trackedReport = await Report.findOne({ ticketId }).select('-citizen_id_hashed');

        if (!trackedReport) {
            return res.status(404).json({ success: false, error: "Requested ledger block ticket identifier not found." });
        }

        return res.status(200).json({ success: true, report: trackedReport });
    } catch (error) {
        next(error);
    }
});

/* ==========================================================================
   WRITE LAYER ENDPOINT
   ========================================================================== */

/**
 * 🔒 ENDPOINT 4: POST /api/reports
 * Transaction Block Creation Entry
 */
router.post('/', upload.single('evidence'), async (req, res, next) => {
    try {
        const { firstName, surname, idNumber, sector, rating, description, province, municipality, ward } = req.body;

        if (!firstName || !surname || !idNumber || !sector || !rating || !description || !province || !municipality || !ward) {
            return res.status(400).json({ error: "Missing required transactional fields." });
        }
        if (idNumber.length !== 13 || !/^\d{13}$/.test(idNumber)) {
            return res.status(400).json({ error: "Invalid South African Identification metadata template structure." });
        }

        // Cryptographic irreversible hashing phase
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

        const newBlock = new Report({
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

        await newBlock.save();

        return res.status(201).json({
            success: true,
            ticketId: ticketId,
            anchors: constitutionalAnchors,
            location: `Ward ${ward.trim()}, ${municipality.trim()}, ${province.trim()}`
        });

    } catch (error) {
        next(error);
    }
});

export default router;