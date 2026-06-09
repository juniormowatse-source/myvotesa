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

// backend/middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
    console.error(err.stack);

    const statusCode = err.statusCode || 500;
    
    return res.status(statusCode).json({
        success: false,
        error: err.message || "An unexpected ledger or server error occurred."
    });
};

// CRITICAL FIX: This line resolves the Render deployment error
export default errorHandler;