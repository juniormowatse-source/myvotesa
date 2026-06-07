import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema(
  {
    citizen_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Citizen',
      required: true,
      index: true
    },

    ward_id: {
      type: Number,
      required: true,
      index: true
    },

    sector: {
      type: String,
      enum: ['water', 'sanitation', 'electricity', 'roads'],
      required: true,
      index: true
    },

    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
      index: true
    },

    description: {
      type: String,
      required: true,
      maxlength: 1000
    },

    // PHASE 1: Photos stored publicly (no E2EE)
    photo_url: {
      type: String, // Public URL to photo
      default: null
    },

    photo_filename: {
      type: String,
      default: null
    },

    // PHASE 1: All reports published automatically
    status: {
      type: String,
      enum: ['published', 'archived'],
      default: 'published',
      index: true
    },

    is_public: {
      type: Boolean,
      default: true, // PHASE 1: Public by default
      index: true
    },

    // PHASE 2: Admin notes (for municipal tracking)
    admin_notes: {
      type: String,
      default: null
    },

    // Audit trail
    ip_address: String,
    user_agent: String,

    created_at: {
      type: Date,
      default: Date.now,
      index: true
    },

    updated_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
  }
);

// Indexes for public leaderboard queries
reportSchema.index({ ward_id: 1, sector: 1, rating: 1 });
reportSchema.index({ ward_id: 1, created_at: -1 });
reportSchema.index({ is_public: 1, created_at: -1 });

// TTL index: Archive reports older than 1 year (PHASE 1 pilot)
reportSchema.index(
  { created_at: 1 },
  { expireAfterSeconds: 365 * 24 * 60 * 60 }
);

export default mongoose.model('Report', reportSchema);
