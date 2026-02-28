// content/listing-scraper.js
// Runs on Etsy listing pages. Scrapes listing data and sends to service worker.

(function () {
    'use strict';

    // Only run on listing pages (supports regional paths like /uk/listing/, /de/listing/, etc.)
    if (!/etsy\.com\/(?:[a-z]{2}\/)?listing\//.test(window.location.href)) return;

    /**
     * Extract listing_id from the current URL path.
     * e.g. /listing/123456789/some-item → "123456789"
     */
    function getListingId() {
        const match = window.location.pathname.match(/\/listing\/(\d+)/);
        return match ? match[1] : null;
    }

    /**
     * Parse a price string like "$24.99" or "24,99 €"
     * Returns { price: 24.99, currency: '$' }
     */
    function parsePrice(text) {
        if (!text) return { price: null, currency: null };
        const currencyMatch = text.match(/[£$€¥₹]/);
        const currency = currencyMatch ? currencyMatch[0] : null;
        const numMatch = text.replace(/,/g, '').match(/[\d.]+/);
        const price = numMatch ? parseFloat(numMatch[0]) : null;
        return { price, currency };
    }

    /**
     * Parse a number from a string, e.g. "1,234" → 1234
     */
    function parseNumber(text) {
        if (!text) return null;
        const cleaned = text.replace(/,/g, '').match(/\d+/);
        return cleaned ? parseInt(cleaned[0], 10) : null;
    }

    function scrapeListingPage() {
        const listing_id = getListingId();
        if (!listing_id) return null;

        // Price — Etsy shows price in a few possible selectors
        const priceSelectors = [
            '[data-buy-box-listing-price]',
            '.wt-text-title-larger',
            '[data-testid="price-only"]',
            '.currency-value',
            'p[class*="price"]',
        ];
        let priceText = null;
        for (const sel of priceSelectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim()) {
                priceText = el.textContent.trim();
                break;
            }
        }
        const { price: listing_price, currency: listing_currency } = parsePrice(priceText);

        // Favorites — "X people have this in their carts" or heart count
        let listing_favorites = null;
        const favSelectors = [
            '[data-testid="wishlist-count"]',
            'button[data-testid="add-to-favorites"] span',
            '.wt-btn--nudge span',
            'span[aria-label*="favorite"]',
        ];
        for (const sel of favSelectors) {
            const el = document.querySelector(sel);
            if (el) {
                const num = parseNumber(el.textContent);
                if (num !== null) { listing_favorites = num; break; }
            }
        }

        // Reviews — review count on listing
        let listing_reviews = null;
        const reviewSelectors = [
            '[data-testid="reviews-section"] a',
            'a[href*="#reviews"]',
            '.wt-tab__anchor[href*="reviews"]',
            'span[data-component="Rating"] + span',
        ];
        for (const sel of reviewSelectors) {
            const el = document.querySelector(sel);
            if (el) {
                const num = parseNumber(el.textContent);
                if (num !== null) { listing_reviews = num; break; }
            }
        }

        // Listing publish date — sometimes visible in listing details
        let listing_publish_date = null;
        const allText = document.body.innerText;
        const datePatterns = [
            /listed\s+on\s+([\w]+ \d{1,2},? \d{4})/i,
            /originally listed\s+on\s+([\w]+ \d{1,2},? \d{4})/i,
        ];
        for (const pat of datePatterns) {
            const match = allText.match(pat);
            if (match) { listing_publish_date = match[1]; break; }
        }

        // Bestseller badge
        const is_bestseller = !!document.querySelector(
            '[data-testid="listing-page-badge-bestseller"], [class*="badge"][class*="bestseller"], [aria-label*="Bestseller"]'
        ) || document.body.innerText.toLowerCase().includes('bestseller');

        // Popular now badge
        const is_popular_now = !!document.querySelector(
            '[data-testid*="popular"], [class*="popular-now"]'
        ) || /popular now/i.test(document.body.innerText);

        // Breadcrumb category / subcategory
        const breadcrumbs = Array.from(document.querySelectorAll(
            '[data-testid="breadcrumb"] a, nav[aria-label="breadcrumb"] a, .wt-breadcrumb a'
        )).map(el => el.textContent.trim()).filter(Boolean);
        const category = breadcrumbs.length > 1 ? breadcrumbs[1] : null;
        const subcategory = breadcrumbs.length > 2 ? breadcrumbs[2] : null;

        // Shop name & URL — use specific selectors first, then scan all links
        let shop_name = null;
        let shop_url = null;

        const shopLinkSelectors = [
            '[data-testid="shop-name-link"]',
            '[data-testid="listing-page-shop-name"]',
            'a[data-shop-name]',
            '.shop-name-and-title-container a',
            '.listing-page-column-right a[href*="/shop/"]',
        ];

        for (const sel of shopLinkSelectors) {
            const el = document.querySelector(sel);
            if (el && el.href && el.href.includes('/shop/')) {
                const match = el.href.match(/(https:\/\/www\.etsy\.com\/(?:[a-z]{2}\/)?shop\/([^/?#]+))/);
                if (match) {
                    shop_url = match[1];
                    shop_name = el.textContent.trim() || match[2];
                    break;
                }
            }
        }

        // Broad fallback: scan every link on the page for a /shop/ URL near product info
        if (!shop_url) {
            const allLinks = Array.from(document.querySelectorAll('a[href*="/shop/"]'));
            for (const el of allLinks) {
                const match = el.href.match(/(https:\/\/www\.etsy\.com\/(?:[a-z]{2}\/)?shop\/([^/?#]+))/);
                // Skip Etsy generic nav links (e.g. /shop/yourEtsy, /shop/updates)
                if (match && !/\/(yourEtsy|updates|favorites|sold|listings)/.test(match[1])) {
                    shop_url = match[1];
                    shop_name = el.textContent.trim() || match[2];
                    break;
                }
            }
        }

        console.log('[EtsyResearch] listing-scraper: shop_name =', shop_name, '| shop_url =', shop_url);

        return {
            listing_id,
            listing_price,
            listing_currency,
            listing_favorites,
            listing_reviews,
            listing_publish_date,
            is_bestseller,
            is_popular_now,
            category,
            subcategory,
            shop_name,
            shop_url,
        };
    }

    // Wait for DOM to be ready enough to scrape
    function init() {
        const data = scrapeListingPage();
        if (!data || !data.listing_id) {
            console.warn('[EtsyResearch] listing-scraper: Could not extract listing data.');
            return;
        }

        console.log('[EtsyResearch] listing-scraper: Sending LISTING_DATA_READY', data);
        chrome.runtime.sendMessage({ type: 'LISTING_DATA_READY', data });
    }

    // Give the page a moment to settle after document_idle
    setTimeout(init, 800);
})();
