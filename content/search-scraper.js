// content/search-scraper.js
// Runs on Etsy search results pages. Extracts search session data and sends to service worker.

(function () {
    'use strict';

    console.log('[EtsyResearch] search-scraper: Script loaded on', window.location.href);

    // Only run on Etsy search pages (supports regional paths like /uk/search, /de/search, etc.)
    if (!/etsy\.com\/(?:[a-z]{2}\/)?search/.test(window.location.href)) {
        console.log('[EtsyResearch] search-scraper: Not a search page, skipping.');
        return;
    }
    console.log('[EtsyResearch] search-scraper: Detected as search page, proceeding...');

    function getUrlParam(name) {
        const params = new URLSearchParams(window.location.search);
        return params.get(name);
    }

    function scrapeSearchPage() {
        const search_keyword_raw = getUrlParam('q') || '';
        const search_keyword = decodeURIComponent(search_keyword_raw)
            .replace(/\+/g, ' ')
            .toLowerCase()
            .trim();

        const pageParam = getUrlParam('page');
        const page_number = pageParam ? parseInt(pageParam, 10) : 1;

        const search_url = window.location.href;

        // Extract listing IDs from listing card links
        const listingLinks = Array.from(document.querySelectorAll('a[href*="/listing/"]'));
        const seen = new Set();
        const listing_ids_found = [];

        for (const link of listingLinks) {
            const href = link.href || '';
            const match = href.match(/\/listing\/(\d+)/);
            if (match && !seen.has(match[1])) {
                seen.add(match[1]);
                listing_ids_found.push(match[1]);
            }
        }

        const total_results_displayed = listing_ids_found.length;
        const top_listing_id = listing_ids_found[0] || null;

        return {
            search_keyword_raw,
            search_keyword,
            page_number,
            listing_ids_found,
            total_results_displayed,
            top_listing_id,
            search_url,
        };
    }

    function init() {
        // Only send if there's a keyword
        const data = scrapeSearchPage();
        if (!data.search_keyword) {
            console.warn('[EtsyResearch] search-scraper: No search keyword found, skipping.');
            return;
        }

        console.log('[EtsyResearch] search-scraper: Sending SEARCH_SESSION_DATA', data);
        chrome.runtime.sendMessage({ type: 'SEARCH_SESSION_DATA', data });
    }

    setTimeout(init, 1000);
})();
