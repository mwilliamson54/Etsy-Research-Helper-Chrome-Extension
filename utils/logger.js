// utils/logger.js
// Prefixed logger utility. All output is prefixed with [EtsyResearch].
// Set DEBUG = false in CONFIG to suppress info-level logs.

// Import CONFIG if available (works in content scripts / service worker)
let DEBUG = true;
try {
    // Attempt to read DEBUG from CONFIG if loaded
    if (typeof CONFIG !== 'undefined' && typeof CONFIG.DEBUG !== 'undefined') {
        DEBUG = CONFIG.DEBUG;
    }
} catch (e) {
    // Default to true if CONFIG is not available
}

const PREFIX = '[EtsyResearch]';

const logger = {
    log(...args) {
        if (DEBUG) {
            console.log(PREFIX, ...args);
        }
    },

    warn(...args) {
        console.warn(PREFIX, ...args);
    },

    error(...args) {
        console.error(PREFIX, ...args);
    },
};
