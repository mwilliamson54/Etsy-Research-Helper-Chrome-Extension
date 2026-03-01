// background/service-worker.js
// Handles messaging between content scripts, manages shop tab lifecycle, and saves data.

importScripts(
    '../config/settings.js',
    '../utils/age-formatter.js',
    '../core/calculator.js',
    '../core/estimator.js',
    '../storage/cache.js',
    '../storage/supabase-client.js'
);

// ─── State ────────────────────────────────────────────────────────────────

// Map of shopTabId → resolve function, for SHOP_DATA_READY responses
const pendingShopScrapes = new Map();

// Map of listingTabId → shop background tabId (listing page pipeline)
const activeShopTabs = new Map();

// Map of shopUrl → true, to prevent opening duplicate background tabs
// when multiple SERP cards from the same shop request data simultaneously
const activeSerpScrapes = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────

function waitForTabLoad(tabId) {
    return new Promise((resolve) => {
        const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
        chrome.tabs.get(tabId, (tab) => {
            if (tab && tab.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        });
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Shared shop scraping core ────────────────────────────────────────────
// Used by both the listing-page pipeline and the SERP pipeline.
// Returns shopData object or null on failure.

async function scrapeShopByUrl(shopUrl) {
    // Check cache first
    let shopData = null;
    try { shopData = await getCache(shopUrl); } catch(e) {}
    if (shopData) {
        console.log('[EtsyResearch] service-worker: cache hit for', shopUrl);
        return shopData;
    }

    // Open background tab
    const shopTab = await new Promise((resolve) => {
        chrome.tabs.create({ url: shopUrl, active: false }, (tab) => resolve(tab));
    });

    await waitForTabLoad(shopTab.id);

    const delay = (typeof CONFIG !== 'undefined') ? CONFIG.SHOP_SCRAPE_DELAY_MS : 1500;
    await sleep(delay);

    // Inject shop scraper
    await chrome.scripting.executeScript({
        target: { tabId: shopTab.id },
        files: ['content/shop-scraper.js'],
    });

    // Wait for SHOP_DATA_READY
    shopData = await new Promise((resolve) => {
        pendingShopScrapes.set(shopTab.id, resolve);
        chrome.tabs.sendMessage(shopTab.id, { type: 'SCRAPE_SHOP', tabId: shopTab.id });
        setTimeout(() => {
            if (pendingShopScrapes.has(shopTab.id)) {
                pendingShopScrapes.delete(shopTab.id);
                console.warn('[EtsyResearch] service-worker: shop scrape timeout for', shopUrl);
                resolve(null);
            }
        }, 30000);
    });

    // Close background tab
    try { await chrome.tabs.remove(shopTab.id); } catch(e) {}

    // Cache result
    if (shopData) {
        try { await setCache(shopUrl, shopData); } catch(e) {}
    }

    return shopData;
}

// ─── LISTING PAGE pipeline (existing) ────────────────────────────────────

async function handleListingDataReady(listingData, listingTabId) {
    console.log('[EtsyResearch] service-worker: LISTING_DATA_READY from tab', listingTabId);

    if (!listingData.shop_url) {
        console.warn('[EtsyResearch] service-worker: No shop_url, cannot scrape shop.');
        return;
    }

    if (activeShopTabs.has(listingTabId)) {
        console.log('[EtsyResearch] service-worker: Already scraping shop for tab', listingTabId);
        return;
    }

    activeShopTabs.set(listingTabId, true);

    const shopData = await scrapeShopByUrl(listingData.shop_url).catch(e => {
        console.error('[EtsyResearch] service-worker: scrapeShopByUrl failed', e);
        return null;
    });

    activeShopTabs.delete(listingTabId);

    if (!shopData) {
        console.error('[EtsyResearch] service-worker: Shop data unavailable.');
        return;
    }

    const estimation = estimateListing(listingData, shopData);

    const combined = {
        listing_id:              listingData.listing_id,
        listing_favorites:       listingData.listing_favorites,
        listing_reviews:         listingData.listing_reviews,
        listing_publish_date:    listingData.listing_publish_date,
        is_bestseller:           listingData.is_bestseller,
        is_popular_now:          listingData.is_popular_now,
        category:                listingData.category,
        subcategory:             listingData.subcategory,
        listing_price:           listingData.listing_price,
        listing_currency:        listingData.listing_currency,
        shop_name:               listingData.shop_name,
        shop_url:                listingData.shop_url,
        total_shop_sales:        shopData.total_shop_sales,
        total_shop_listings:     shopData.total_shop_listings,
        total_shop_reviews:      shopData.total_shop_reviews,
        shop_created_year:       shopData.shop_created_year,
        ...estimation,
    };

    try {
        await chrome.tabs.sendMessage(listingTabId, { type: 'RENDER_BAR', data: combined });
    } catch(e) {
        console.warn('[EtsyResearch] service-worker: Could not send RENDER_BAR', e);
    }

    // Save to Supabase
    const supabaseRow = {
        listing_id:             combined.listing_id,
        shop_name:              combined.shop_name,
        shop_url:               combined.shop_url,
        shop_age_display:       combined.shop_age_display,
        shop_created_year:      combined.shop_created_year,
        total_shop_sales:       combined.total_shop_sales,
        total_shop_listings:    combined.total_shop_listings,
        total_shop_reviews:     combined.total_shop_reviews,
        estimated_listing_sales: combined.estimated_listing_sales,
        estimated_sales_low:    combined.estimated_sales_low,
        estimated_sales_high:   combined.estimated_sales_high,
        listing_favorites:      combined.listing_favorites,
        listing_reviews:        combined.listing_reviews,
        listing_price:          combined.listing_price,
        listing_currency:       combined.listing_currency,
        listing_age_days:       combined.listing_age_days,
        listing_age_display:    combined.listing_age_display,
        listing_publish_date:   combined.listing_publish_date,
        category:               combined.category,
        subcategory:            combined.subcategory,
        is_bestseller:          combined.is_bestseller,
        is_popular_now:         combined.is_popular_now,
        confidence_score:       combined.confidence_score,
        confidence_reason:      combined.confidence_reason,
        sample_listings_used:   combined.sample_listings_used,
    };
    saveListing(supabaseRow).catch(e => {
        console.error('[EtsyResearch] service-worker: saveListing failed', e);
    });
}

// ─── SERP pipeline (new) ──────────────────────────────────────────────────
// Handles SERP_LISTING_REQUEST: scrapes shop for a SERP card and sends
// SERP_SHOP_DATA back to the originating tab.

async function handleSerpListingRequest(msg, senderTabId) {
    const { listing_id, shop_url, listing_data } = msg;

    if (!shop_url || !listing_id) {
        console.warn('[EtsyResearch] service-worker: SERP request missing shop_url or listing_id');
        return;
    }

    // Prevent duplicate concurrent scrapes for the same shop URL
    if (activeSerpScrapes.has(shop_url)) {
        console.log('[EtsyResearch] service-worker: SERP scrape already in progress for', shop_url);
        // Wait for the existing scrape to finish then serve from cache
        // Simple approach: poll cache every 2s for up to 40s
        let waited = 0;
        while (activeSerpScrapes.has(shop_url) && waited < 40000) {
            await sleep(2000);
            waited += 2000;
        }
        // Try to serve from cache now
        let cached = null;
        try { cached = await getCache(shop_url); } catch(e) {}
        if (cached) {
            await sendSerpResponse(senderTabId, listing_id, listing_data, cached);
        }
        return;
    }

    activeSerpScrapes.set(shop_url, true);

    try {
        const shopData = await scrapeShopByUrl(shop_url);
        await sendSerpResponse(senderTabId, listing_id, listing_data, shopData);
    } catch(e) {
        console.error('[EtsyResearch] service-worker: SERP shop scrape failed for', shop_url, e);
        // Send null so the content script hides the placeholders
        try {
            await chrome.tabs.sendMessage(senderTabId, {
                type:       'SERP_SHOP_DATA',
                listing_id: listing_id,
                data:       null,
            });
        } catch(e2) {}
    } finally {
        activeSerpScrapes.delete(shop_url);
    }
}

async function sendSerpResponse(senderTabId, listing_id, listing_data, shopData) {
    if (!shopData) {
        try {
            await chrome.tabs.sendMessage(senderTabId, {
                type:       'SERP_SHOP_DATA',
                listing_id: listing_id,
                data:       null,
            });
        } catch(e) {}
        return;
    }

    // Run the estimator using whatever listing data we have from the SERP card
    let estimation = {};
    try {
        estimation = estimateListing(listing_data || {}, shopData);
    } catch(e) {
        console.warn('[EtsyResearch] service-worker: estimateListing failed for SERP card', e);
    }

    const responseData = {
        // Shop fields
        shop_age_display:        estimation.shop_age_display || null,
        total_shop_sales:        shopData.total_shop_sales,
        total_shop_listings:     shopData.total_shop_listings,
        total_shop_reviews:      shopData.total_shop_reviews,
        shop_created_year:       shopData.shop_created_year,
        // Estimation fields
        estimated_listing_sales: estimation.estimated_listing_sales,
        estimated_sales_low:     estimation.estimated_sales_low,
        estimated_sales_high:    estimation.estimated_sales_high,
        confidence_score:        estimation.confidence_score,
        confidence_reason:       estimation.confidence_reason,
    };

    try {
        await chrome.tabs.sendMessage(senderTabId, {
            type:       'SERP_SHOP_DATA',
            listing_id: listing_id,
            data:       responseData,
        });
        console.log('[EtsyResearch] service-worker: SERP_SHOP_DATA sent for listing', listing_id);
    } catch(e) {
        console.warn('[EtsyResearch] service-worker: Could not send SERP_SHOP_DATA to tab', senderTabId, e);
    }

    // Optionally save to Supabase
    if (listing_data) {
        const supabaseRow = {
            listing_id:              listing_id,
            shop_url:                listing_data.shop_url,
            total_shop_sales:        shopData.total_shop_sales,
            total_shop_listings:     shopData.total_shop_listings,
            shop_created_year:       shopData.shop_created_year,
            estimated_listing_sales: estimation.estimated_listing_sales,
            estimated_sales_low:     estimation.estimated_sales_low,
            estimated_sales_high:    estimation.estimated_sales_high,
            listing_favorites:       listing_data.listing_favorites,
            listing_reviews:         listing_data.listing_reviews,
            listing_price:           listing_data.listing_price,
            listing_currency:        listing_data.listing_currency,
            is_bestseller:           listing_data.is_bestseller,
            is_popular_now:          listing_data.is_popular_now,
            confidence_score:        estimation.confidence_score,
            confidence_reason:       estimation.confidence_reason,
            sample_listings_used:    estimation.sample_listings_used,
        };
        saveListing(supabaseRow).catch(e => {
            console.error('[EtsyResearch] service-worker: saveListing (SERP) failed', e);
        });
    }
}

// ─── SHOP_DATA_READY handler ──────────────────────────────────────────────

function handleShopDataReady(msg) {
    const shopTabId = msg.tabId || msg.data?.tabId;
    if (shopTabId && pendingShopScrapes.has(shopTabId)) {
        const resolve = pendingShopScrapes.get(shopTabId);
        pendingShopScrapes.delete(shopTabId);
        resolve(msg.data || null);
    }
}

// ─── SEARCH_SESSION_DATA handler ─────────────────────────────────────────

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
        if (senderTabId) handleListingDataReady(msg.data, senderTabId);
        return false;
    }

    if (msg.type === 'SERP_LISTING_REQUEST') {
        if (senderTabId) handleSerpListingRequest(msg, senderTabId);
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