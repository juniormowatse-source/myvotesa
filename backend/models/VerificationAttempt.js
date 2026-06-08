import mongoose from 'mongoose';

const verificationAttemptSchema = new mongoose.Schema({
  id_number_hash: { type: String, required: true },
  phone_number_hash: { type: String, required: true },
  otp_hash: { type: String, required: true },
  first_name_encrypted: { type: String, required: true },
  surname_encrypted: { type: String, required: true },
  ward_id: { type: Number, required: true },
  ip_address: { type: String },
  user_agent: { type: String },
  attempt_type: { type: String, required: true },
  otp_expiry: { type: Date, required: true },
  otp_attempts: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'verified', 'expired', 'blocked'], default: 'pending' },
  citizen_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Citizen' },
  verified_at: { type: Date }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Index for auto-expiring old pending attempts if needed, and for quick rate-limiting lookups
verificationAttemptSchema.index({ phone_number_hash: 1, created_at: -1 });

const VerificationAttempt = mongoose.model('VerificationAttempt', verificationAttemptSchema);
export default VerificationAttempt;