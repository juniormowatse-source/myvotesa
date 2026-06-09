// backend/middleware/securityHeaders.js

/**
 * Custom Security Headers Middleware
 * Protects the civic ledger app against clickjacking, MIME sniffing, and cross-site scripting (XSS)
 */
const securityHeaders = (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    
    // Allows internal self-loading and images from your branding assets folder
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: /assets/;");
    
    next();
};

// Satisfies 'import securityHeaders from ...' in server.js
export default securityHeaders;