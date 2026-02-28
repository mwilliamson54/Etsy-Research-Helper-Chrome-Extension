// storage/cache.js
// Local cache for shop data using chrome.storage.local.
// Avoids repeated background tab scraping within the cache window.

// Cache duration is read from CONFIG if available, otherwise defaults to 6 hours
const CACHE_DURATION_MS = (typeof CONFIG !== 'undefined' && CONFIG.CACHE_DURATION_MS)
    ? CONFIG.CACHE_DURATION_MS
    : 1000 * 60 * 60 * 6;

/**
 * Sanitize a shopUrl into a safe storage key.
 * @param {string} shopUrl
 * @returns {string}
 */
function sanitizeKey(shopUrl) {
    return 'shop_cache__' + shopUrl.replace(/[^a-zA-Z0-9]/g, '_');
}

/**
 * Store shop data in local cache with current timestamp.
 * @param {string} shopUrl
 * @param {object} shopData
 * @returns {Promise<void>}
 */
function setCache(shopUrl, shopData) {
    const key = sanitizeKey(shopUrl);
    const entry = {
        data: shopData,
        timestamp: Date.now(),
    };
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: entry }, () => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                console.log('[EtsyResearch] cache: Cached shop data for', shopUrl);
                resolve();
            }
        });
    });
}

/**
 * Retrieve cached shop data if it exists and is still fresh.
 * @param {string} shopUrl
 * @returns {Promise<object|null>} shopData or null if expired/not found
 */
function getCache(shopUrl) {
    const key = sanitizeKey(shopUrl);
    return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
            const entry = result[key];
            if (!entry) {
                resolve(null);
                return;
            }
            const age = Date.now() - entry.timestamp;
            if (age > CACHE_DURATION_MS) {
                console.log('[EtsyResearch] cache: Cache expired for', shopUrl);
                resolve(null);
                return;
            }
            console.log('[EtsyResearch] cache: Cache hit for', shopUrl);
            resolve(entry.data);
        });
    });
}

/**
 * Clear all cached shop data.
 * @returns {Promise<void>}
 */
function clearCache() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(null, (items) => {
            const cacheKeys = Object.keys(items).filter(k => k.startsWith('shop_cache__'));
            if (cacheKeys.length === 0) { resolve(); return; }
            chrome.storage.local.remove(cacheKeys, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    console.log('[EtsyResearch] cache: Cleared', cacheKeys.length, 'cached entries.');
                    resolve();
                }
            });
        });
    });
}
