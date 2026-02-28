// utils/dom-helpers.js
// DOM utility helpers for safe element querying and waiting.

/**
 * Waits for a DOM element matching the selector to appear.
 * @param {string} selector - CSS selector
 * @param {number} timeout - Milliseconds before rejecting (default 5000)
 * @returns {Promise<Element>} Resolves with the element, rejects on timeout
 */
function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(selector);
        if (existing) {
            resolve(existing);
            return;
        }

        const observer = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) {
                observer.disconnect();
                clearTimeout(timer);
                resolve(el);
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });

        const timer = setTimeout(() => {
            observer.disconnect();
            reject(new Error(`[EtsyResearch] waitForElement: Timeout waiting for "${selector}"`));
        }, timeout);
    });
}

/**
 * Safely queries for a single element. Returns null instead of throwing.
 * @param {string} selector
 * @param {Document|Element} context
 * @returns {Element|null}
 */
function safeQuerySelector(selector, context = document) {
    try {
        return context.querySelector(selector) || null;
    } catch (e) {
        return null;
    }
}

/**
 * Safely queries for all matching elements. Returns empty array instead of throwing.
 * @param {string} selector
 * @param {Document|Element} context
 * @returns {NodeList|Array}
 */
function safeQuerySelectorAll(selector, context = document) {
    try {
        return context.querySelectorAll(selector) || [];
    } catch (e) {
        return [];
    }
}

/**
 * Extracts trimmed text content from element matching selector.
 * @param {string} selector
 * @param {Document|Element} context
 * @returns {string|null}
 */
function extractText(selector, context = document) {
    const el = safeQuerySelector(selector, context);
    if (!el) return null;
    const text = el.textContent && el.textContent.trim();
    return text || null;
}

/**
 * Extracts and parses a number from element text, handling commas.
 * e.g. "1,234 sales" → 1234
 * @param {string} selector
 * @param {Document|Element} context
 * @returns {number|null}
 */
function extractNumber(selector, context = document) {
    const text = extractText(selector, context);
    if (!text) return null;
    const cleaned = text.replace(/,/g, '').match(/[\d.]+/);
    if (!cleaned) return null;
    const num = parseFloat(cleaned[0]);
    return isNaN(num) ? null : num;
}
