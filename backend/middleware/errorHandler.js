// backend/middleware/errorHandler.js

const errorHandler = (err, req, res, next) => {
    // Log the error internally for auditing
    console.error(`\x1b[31m[Ledger Error Interceptor]\x1b[0m: ${err.message}`);
    if (err.stack) console.error(err.stack);

    const statusCode = err.statusCode || 500;
    
    res.status(statusCode).json({
        success: false,
        error: err.message || "Internal ledger processing crash occurred during block execution."
    });
};

// This line satisfies the exact default import failing in new.png
export default errorHandler;