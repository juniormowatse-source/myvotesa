import mongoose from 'mongoose';

const citizenSchema = new mongoose.Schema(
  {
    // Hashed SA ID Number (for lookup only, never store raw)
    id_number_hash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    // Encrypted PII - encrypted at rest
    first_name_encrypted: {
      type: String,
      required: true
    },

    surname_encrypted: {
      type: String,
      required: true
    },

    phone_number_hash: {
      type: String,
      required: true,
      index: true
    },

    // Civic location
    ward_id: {
      type: Number,
      required: true,
      index: true
    },

    // Verification status (POPIA compliance)
    is_verified: {
      type: Boolean,
      default: false
    },

    verification_method: {
      type: String,
      enum: ['otp_sassa', 'manual_admin'],
      default: 'otp_sassa'
    },

    verification_date: {
      type: Date,
      default: Date.now
    },

    // Session management
    refresh_token: {
      type: String,
      default: null,
      select: false // Don't include in default queries
    },

    // Audit trail
    ip_address: String,
    user_agent: String,
    last_login: Date,
    last_ip: String,
    last_logout: Date,

    // POPIA data retention tracking
    data_anonymized: {
      type: Boolean,
      default: false
    },

    data_anonymized_at: Date,

    // Account status
    is_active: {
      type: Boolean,
      default: true
    },

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

// POPIA Compliance: Automatic anonymization after 90 days of inactivity
citizenSchema.index(
  { created_at: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60,
    partialFilterExpression: { data_anonymized: false }
  }
);

// Performance indexes
citizenSchema.index({ ward_id: 1, created_at: -1 });
citizenSchema.index({ is_verified: 1 });

export default mongoose.model('Citizen', citizenSchema);
