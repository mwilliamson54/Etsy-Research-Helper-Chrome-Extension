// background/service-worker.js
// The coordination brain for the Etsy Research Extension.
// Handles messaging between content scripts, manages shop tab lifecycle, and saves data.

// ─── Script Imports ───────────────────────────────────────────────────────
// In MV3 service workers, we use importScripts for synchronous loading of shared code.
importScripts(
    '../config/settings.js',
    '../utils/age-formatter.js',
    '../core/calculator.js',
    '../core/estimator.js',
    '../storage/cache.js',
    '../storage/supabase-client.js'
);

// ─── State ────────────────────────────────────────────────────────────────
// Map of listingTabId → pending resolve function for SHOP_DATA_READY
const pendingShopScrapes = new Map();

// Map of listingTabId → shop background tabId (to avoid duplicates)
const activeShopTabs = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Wait for a tab to finish loading.
 * @param {number} tabId
 * @returns {Promise<void>}
 */
function waitForTabLoad(tabId) {
    return new Promise((resolve) => {
        const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);

        // Also check immediately in case it's already complete
        chrome.tabs.get(tabId, (tab) => {
            if (tab && tab.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        });
    });
}

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── LISTING_DATA_READY Handler ───────────────────────────────────────────

async function handleListingDataReady(listingData, listingTabId) {
    console.log('[EtsyResearch] service-worker: LISTING_DATA_READY from tab', listingTabId, listingData);

    if (!listingData.shop_url) {
        console.warn('[EtsyResearch] service-worker: No shop_url, cannot scrape shop.');
        return;
    }

    // Prevent duplicate shop tab for the same listing tab
    if (activeShopTabs.has(listingTabId)) {
        console.log('[EtsyResearch] service-worker: Already scraping shop for tab', listingTabId);
        return;
    }

    let shopData = null;

    // ── Cache check ──
    try {
        shopData = await getCache(listingData.shop_url);
    } catch (e) {
        console.warn('[EtsyResearch] service-worker: Cache read failed', e);
    }

    if (!shopData) {
        // ── Open background tab ──
        const shopTab = await new Promise((resolve) => {
            chrome.tabs.create(
                { url: listingData.shop_url, active: false },
                (tab) => resolve(tab)
            );
        });

        activeShopTabs.set(listingTabId, shopTab.id);

        // Wait for the tab to fully load
        await waitForTabLoad(shopTab.id);

        // Human-like delay
        const delay = (typeof CONFIG !== 'undefined') ? CONFIG.SHOP_SCRAPE_DELAY_MS : 1500;
        await sleep(delay);

        // Inject shop-scraper.js into the background tab
        await chrome.scripting.executeScript({
            target: { tabId: shopTab.id },
            files: ['content/shop-scraper.js'],
        });

        // Send SCRAPE_SHOP message to the background tab
        // Include the listingTabId so we can correlate the response
        shopData = await new Promise((resolve) => {
            pendingShopScrapes.set(shopTab.id, resolve);

            chrome.tabs.sendMessage(shopTab.id, {
                type: 'SCRAPE_SHOP',
                tabId: shopTab.id,
            });

            // Timeout after 30 seconds
            setTimeout(() => {
                if (pendingShopScrapes.has(shopTab.id)) {
                    pendingShopScrapes.delete(shopTab.id);
                    console.warn('[EtsyResearch] service-worker: SHOP_DATA_READY timeout for tab', shopTab.id);
                    resolve(null);
                }
            }, 30000);
        });

        // Close the background shop tab
        try {
            await chrome.tabs.remove(shopTab.id);
        } catch (e) {
            console.warn('[EtsyResearch] service-worker: Could not close shop tab', e);
        }
        activeShopTabs.delete(listingTabId);

        // Cache the fresh shop data
        if (shopData) {
            try {
                await setCache(listingData.shop_url, shopData);
            } catch (e) {
                console.warn('[EtsyResearch] service-worker: Cache write failed', e);
            }
        }
    }

    if (!shopData) {
        console.error('[EtsyResearch] service-worker: Shop data unavailable, cannot estimate.');
        return;
    }

    // ── Run estimation ──
    const estimation = estimateListing(listingData, shopData);

    // Build the combined result to send to the listing tab's UI injector
    const combined = {
        // Listing fields
        listing_id: listingData.listing_id,
        listing_favorites: listingData.listing_favorites,
        listing_reviews: listingData.listing_reviews,
        listing_publish_date: listingData.listing_publish_date,
        is_bestseller: listingData.is_bestseller,
        is_popular_now: listingData.is_popular_now,
        category: listingData.category,
        subcategory: listingData.subcategory,
        listing_price: listingData.listing_price,
        listing_currency: listingData.listing_currency,
        shop_name: listingData.shop_name,
        shop_url: listingData.shop_url,
        // Shop fields
        total_shop_sales: shopData.total_shop_sales,
        total_shop_listings: shopData.total_shop_listings,
        total_shop_reviews: shopData.total_shop_reviews,
        shop_created_year: shopData.shop_created_year,
        // Estimation fields
        ...estimation,
    };

    // ── Send RENDER_BAR to listing tab ──
    try {
        await chrome.tabs.sendMessage(listingTabId, { type: 'RENDER_BAR', data: combined });
    } catch (e) {
        console.warn('[EtsyResearch] service-worker: Could not send RENDER_BAR to tab', listingTabId, e);
    }

    // ── Save to Supabase ──
    const supabaseRow = {
        listing_id: combined.listing_id,
        shop_name: combined.shop_name,
        shop_url: combined.shop_url,
        shop_age_display: combined.shop_age_display,
        shop_created_year: combined.shop_created_year,
        total_shop_sales: combined.total_shop_sales,
        total_shop_listings: combined.total_shop_listings,
        total_shop_reviews: combined.total_shop_reviews,
        estimated_listing_sales: combined.estimated_listing_sales,
        estimated_sales_low: combined.estimated_sales_low,
        estimated_sales_high: combined.estimated_sales_high,
        listing_favorites: combined.listing_favorites,
        listing_reviews: combined.listing_reviews,
        listing_price: combined.listing_price,
        listing_currency: combined.listing_currency,
        listing_age_days: combined.listing_age_days,
        listing_age_display: combined.listing_age_display,
        listing_publish_date: combined.listing_publish_date,
        category: combined.category,
        subcategory: combined.subcategory,
        is_bestseller: combined.is_bestseller,
        is_popular_now: combined.is_popular_now,
        confidence_score: combined.confidence_score,
        confidence_reason: combined.confidence_reason,
        sample_listings_used: combined.sample_listings_used,
    };

    saveListing(supabaseRow).catch(e => {
        console.error('[EtsyResearch] service-worker: saveListing failed', e);
    });
}

// ─── SHOP_DATA_READY Handler ──────────────────────────────────────────────

function handleShopDataReady(msg) {
    const shopTabId = msg.tabId || msg.data?.tabId;
    if (shopTabId && pendingShopScrapes.has(shopTabId)) {
        const resolve = pendingShopScrapes.get(shopTabId);
        pendingShopScrapes.delete(shopTabId);
        resolve(msg.data || null);
    }
}

// ─── SEARCH_SESSION_DATA Handler ──────────────────────────────────────────

function handleSearchSessionData(sessionData) {
    console.log('[EtsyResearch] service-worker: SEARCH_SESSION_DATA received', sessionData);
    saveSearchSession(sessionData).catch(e => {
        console.error('[EtsyResearch] service-worker: saveSearchSession failed', e);
    });
}

// ─── Message Listener ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const senderTabId = sender.tab ? sender.tab.id : null;

    if (msg.type === 'LISTING_DATA_READY') {
        if (senderTabId) {
            handleListingDataReady(msg.data, senderTabId);
        }
        return false;
    }

    if (msg.type === 'SHOP_DATA_READY') {
        handleShopDataReady(msg);
        return false;
    }

    if (msg.type === 'SEARCH_SESSION_DATA') {
        handleSearchSessionData(msg.data);
        return false;
    }

    return false;
});

console.log('[EtsyResearch] service-worker: Initialized.');
