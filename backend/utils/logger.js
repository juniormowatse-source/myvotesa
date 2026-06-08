// A clean, production-ready console logger utility
const logger = {
  info: (message, meta = {}) => {
    const timestamp = new Date().toISOString();
    console.log(`[INFO] [${timestamp}] ${message}`, Object.keys(meta).length ? JSON.stringify(meta) : '');
  },
  warn: (message, meta = {}) => {
    const timestamp = new Date().toISOString();
    console.warn(`[WARN] [${timestamp}] ⚠️ ${message}`, Object.keys(meta).length ? JSON.stringify(meta) : '');
  },
  error: (message, meta = {}) => {
    const timestamp = new Date().toISOString();
    console.error(`[ERROR] [${timestamp}] ❌ ${message}`, Object.keys(meta).length ? JSON.stringify(meta) : '');
  }
};

export default logger;