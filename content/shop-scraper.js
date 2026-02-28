// content/shop-scraper.js
// Injected into a background shop tab by the service worker.
// Waits for SCRAPE_SHOP message, then scrapes the shop data and responds.

(function () {
    'use strict';

    const DELAY_MS = 1500;
    const MAX_PAGES = 3;

    function parseNumber(text) {
        if (!text) return null;
        const cleaned = text.replace(/,/g, '').match(/\d+/);
        return cleaned ? parseInt(cleaned[0], 10) : null;
    }

    function parsePrice(text) {
        if (!text) return null;
        const cleaned = text.replace(/,/g, '').match(/[\d.]+/);
        return cleaned ? parseFloat(cleaned[0]) : null;
    }

    /** Scrape listing cards visible on the current page */
    function scrapeListingsOnPage() {
        const cards = Array.from(document.querySelectorAll(
            '[data-listing-id], [data-testid="listing-card"], li[data-listing-card]'
        ));

        // If no data-listing-id cards, try anchor hrefs
        const hrefs = Array.from(document.querySelectorAll('a[href*="/listing/"]'));
        const seen = new Set();
        const listings = [];

        const sources = cards.length > 0 ? cards : hrefs;

        for (const el of sources) {
            let listing_id = el.dataset.listingId || null;
            if (!listing_id) {
                const href = el.href || el.querySelector('a')?.href || '';
                const match = href.match(/\/listing\/(\d+)/);
                if (match) listing_id = match[1];
            }
            if (!listing_id || seen.has(listing_id)) continue;
            seen.add(listing_id);

            const context = el.closest('li') || el;
            const favText = context.querySelector('[data-listing-card-favorite-count], [class*="favorit"], [aria-label*="favorite"]')?.textContent || null;
            const reviewText = context.querySelector('[data-testid*="review"], [class*="review-count"]')?.textContent || null;
            const priceText = context.querySelector('[class*="price"], [data-testid*="price"]')?.textContent || null;

            listings.push({
                listing_id,
                favorites: parseNumber(favText),
                reviews: parseNumber(reviewText),
                price: parsePrice(priceText),
                publish_date: null, // Not usually visible in shop listing cards
            });
        }

        return listings;
    }

    /** Extract main shop-level data from the shop page header */
    function scrapeShopHeader() {
        // Shop name
        let shop_name = null;
        const nameEl = document.querySelector(
            '[data-testid="shop-name"], h1[class*="shop-name"], .shop-name, [class*="shopName"]'
        );
        if (nameEl) shop_name = nameEl.textContent.trim();

        // Total shop sales
        let total_shop_sales = null;
        const salesSelectors = [
            '[data-testid="shop-sales-count"]',
            'span[class*="sales"]',
            'div[class*="shop-stats"] span',
        ];
        for (const sel of salesSelectors) {
            const el = document.querySelector(sel);
            if (el) {
                const num = parseNumber(el.textContent);
                if (num !== null) { total_shop_sales = num; break; }
            }
        }
        // Fallback: search text for "X sales"
        if (total_shop_sales === null) {
            const match = document.body.innerText.match(/([\d,]+)\s+sales?/i);
            if (match) total_shop_sales = parseNumber(match[1]);
        }

        // Shop created year — "On Etsy since YYYY"
        let shop_created_year = null;
        const yearMatch = document.body.innerText.match(/on etsy since\s+(\d{4})/i);
        if (yearMatch) shop_created_year = parseInt(yearMatch[1], 10);

        // Total listings count
        let total_shop_listings = null;
        const listingCountSelectors = [
            '[data-testid="shop-listing-count"]',
            '[class*="listing-count"]',
        ];
        for (const sel of listingCountSelectors) {
            const el = document.querySelector(sel);
            if (el) {
                const num = parseNumber(el.textContent);
                if (num !== null) { total_shop_listings = num; break; }
            }
        }
        if (total_shop_listings === null) {
            const match = document.body.innerText.match(/([\d,]+)\s+listing/i);
            if (match) total_shop_listings = parseNumber(match[1]);
        }

        // Total shop reviews
        let total_shop_reviews = null;
        const reviewSelectors = [
            '[data-testid="shop-review-count"]',
            'a[href*="reviews"] span',
        ];
        for (const sel of reviewSelectors) {
            const el = document.querySelector(sel);
            if (el) {
                const num = parseNumber(el.textContent);
                if (num !== null) { total_shop_reviews = num; break; }
            }
        }
        if (total_shop_reviews === null) {
            const match = document.body.innerText.match(/([\d,]+)\s+reviews?/i);
            if (match) total_shop_reviews = parseNumber(match[1]);
        }

        return { shop_name, total_shop_sales, shop_created_year, total_shop_listings, total_shop_reviews };
    }

    /** Sleep helper */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /** Get next page URL by looking for pagination "Next" link */
    function getNextPageUrl() {
        const nextLink = document.querySelector(
            'a[rel="next"], [data-testid="pagination-next-btn"], a[class*="pagination"][class*="next"]'
        );
        return nextLink ? nextLink.href : null;
    }

    async function scrapeShop() {
        const headerData = scrapeShopHeader();
        let allListings = scrapeListingsOnPage();
        let pagesScraped = 1;

        // Scrape additional pages (up to MAX_PAGES total)
        while (pagesScraped < MAX_PAGES) {
            const nextUrl = getNextPageUrl();
            if (!nextUrl) break;

            await sleep(DELAY_MS);

            try {
                const resp = await fetch(nextUrl, { credentials: 'include' });
                const html = await resp.text();
                const parser = new DOMParser();
                const nextDoc = parser.parseFromString(html, 'text/html');

                // Temporarily swap document for scraping (we'll use a scoped helper)
                const cards = Array.from(nextDoc.querySelectorAll('a[href*="/listing/"]'));
                const seen = new Set(allListings.map(l => l.listing_id));

                for (const el of cards) {
                    const href = el.href || '';
                    const match = href.match(/\/listing\/(\d+)/);
                    if (!match) continue;
                    const listing_id = match[1];
                    if (seen.has(listing_id)) continue;
                    seen.add(listing_id);

                    const context = el.closest('li') || el;
                    allListings.push({
                        listing_id,
                        favorites: null,
                        reviews: null,
                        price: null,
                        publish_date: null,
                    });
                }
                pagesScraped++;
            } catch (e) {
                console.warn('[EtsyResearch] shop-scraper: Failed to fetch next page', e);
                break;
            }
        }

        // Cap at 15 sample listings
        const sample_listings = allListings.slice(0, 15);

        return {
            ...headerData,
            sample_listings,
        };
    }

    // Listen for SCRAPE_SHOP message from service worker
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type !== 'SCRAPE_SHOP') return;

        console.log('[EtsyResearch] shop-scraper: Received SCRAPE_SHOP, beginning scrape...');

        scrapeShop().then(data => {
            console.log('[EtsyResearch] shop-scraper: Sending SHOP_DATA_READY', data);
            chrome.runtime.sendMessage({ type: 'SHOP_DATA_READY', data, tabId: msg.tabId });
        }).catch(err => {
            console.error('[EtsyResearch] shop-scraper: Error during scrape', err);
            chrome.runtime.sendMessage({ type: 'SHOP_DATA_READY', data: null, error: err.message, tabId: msg.tabId });
        });

        return true; // async response
    });
})();
