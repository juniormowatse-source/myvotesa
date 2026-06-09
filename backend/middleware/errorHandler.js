// backend/middleware/errorHandler.js

/**
 * Custom Operational Error Utility Class
 * Used across modular routes (like auth.js) to pass clean HTTP status codes
 */
export class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Global Express Error Interceptor Pipeline
 */
const errorHandler = (err, req, res, next) => {
    // Log the error internally for system auditing
    console.error(`\x1b[31m[Ledger Error Interceptor]\x1b[0m: ${err.message}`);
    if (err.stack) console.error(err.stack);

    const statusCode = err.statusCode || 500;
    
    res.status(statusCode).json({
        success: false,
        error: err.message || "Internal ledger processing crash occurred during block execution."
    });
};

// Satisfies 'import errorHandler from ...' in server.js
export default errorHandler;