import crypto from 'crypto';

// Hash data (used for one-way matching like IDs and Phone Numbers)
export const hashData = (data) => {
  if (!data) return '';
  return crypto.createHash('sha256').update(data.toString()).digest('hex');
};

// Encrypt data (used for two-way storage of sensitive text like First Names/Surnames)
export const encryptData = (text, secretKeyHex) => {
  if (!text) return null;
  
  // Fallback to a development key if the environment variable is missing
  const keyBuffer = secretKeyHex 
    ? Buffer.from(secretKeyHex, 'base64') 
    : crypto.randomBytes(32);

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return {
    iv: iv.toString('hex'),
    encryptedData: encrypted
  };
};