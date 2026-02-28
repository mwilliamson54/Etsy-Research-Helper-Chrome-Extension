// content/search-card-injector.js
// Injects a compact research mini-bar below each listing card on Etsy search pages.
// The bar appears IMMEDIATELY with shimmer/skeleton placeholders, then values
// fade in progressively as each metric is extracted from the card DOM.

(function () {
    'use strict';

    // Only run on search/browse pages (not on individual listing pages)
    // Supports regional paths like /uk/listing/, /de/listing/, etc.
    const href = window.location.href;
    if (/etsy\.com\/(?:[a-z]{2}\/)?listing\//.test(href)) return;

    const BAR_CLASS = 'etsy-research-mini-bar';
    const BAR_ATTR = 'data-erbar-injected';
    const SHIMMER_CLASS = 'ermb-shimmer';
    const LOADED_CLASS = 'ermb-loaded';

    // ─── Style Injection ─────────────────────────────────────────────────────

    function injectMiniBarStyles() {
        const styleId = 'etsy-research-mini-bar-style';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* ── Shimmer keyframes ── */
            @keyframes ermb-shimmer-sweep {
                0%   { background-position: -200% 0; }
                100% { background-position: 200% 0; }
            }
            @keyframes ermb-fade-in {
                from { opacity: 0; transform: translateY(2px); }
                to   { opacity: 1; transform: translateY(0); }
            }

            /* ── Mini-bar container ── */
            .${BAR_CLASS} {
                display: flex !important;
                flex-wrap: wrap !important;
                align-items: center !important;
                gap: 4px 6px !important;
                width: 100% !important;
                box-sizing: border-box !important;
                padding: 5px 8px !important;
                margin-top: 4px !important;
                background: #f8f8f8 !important;
                border: 1px solid #e0e0e0 !important;
                border-radius: 6px !important;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                font-size: 11px !important;
                color: #444 !important;
                line-height: 1.3 !important;
                min-height: 26px !important;
                overflow: hidden !important;
            }

            /* ── Chip (value container) ── */
            .${BAR_CLASS} .ermb-chip {
                display: inline-flex !important;
                align-items: center !important;
                gap: 3px !important;
                background: #fff !important;
                border: 1px solid #e5e5e5 !important;
                border-radius: 4px !important;
                padding: 2px 6px !important;
                white-space: nowrap !important;
                font-size: 11px !important;
                color: #555 !important;
                min-width: 40px !important;
                min-height: 18px !important;
                position: relative !important;
                overflow: hidden !important;
            }
            .${BAR_CLASS} .ermb-chip .ermb-label {
                color: #999 !important;
                font-size: 10px !important;
            }
            .${BAR_CLASS} .ermb-chip .ermb-value {
                font-weight: 600 !important;
                color: #222 !important;
                font-size: 11px !important;
            }

            /* ── Shimmer placeholder (inside chip) ── */
            .${BAR_CLASS} .${SHIMMER_CLASS} .ermb-value {
                display: inline-block !important;
                width: 36px !important;
                height: 12px !important;
                border-radius: 3px !important;
                background: linear-gradient(90deg, #eee 25%, #ddd 50%, #eee 75%) !important;
                background-size: 200% 100% !important;
                animation: ermb-shimmer-sweep 1.4s ease-in-out infinite !important;
                color: transparent !important;
                user-select: none !important;
            }

            /* ── Loaded state (fade in) ── */
            .${BAR_CLASS} .${LOADED_CLASS} .ermb-value {
                animation: ermb-fade-in 0.3s ease-out forwards !important;
                width: auto !important;
                height: auto !important;
                background: none !important;
                color: #222 !important;
            }

            /* ── Badge chips (bestseller / popular) ── */
            .${BAR_CLASS} .ermb-badge {
                display: inline-flex !important;
                align-items: center !important;
                gap: 2px !important;
                border-radius: 4px !important;
                padding: 2px 5px !important;
                font-size: 10px !important;
                font-weight: 600 !important;
                white-space: nowrap !important;
            }
            .${BAR_CLASS} .ermb-badge.bestseller {
                background: #fff3cd !important;
                color: #856404 !important;
                border: 1px solid #ffc107 !important;
            }
            .${BAR_CLASS} .ermb-badge.popular {
                background: #fde9ee !important;
                color: #c0123c !important;
                border: 1px solid #fbd3dc !important;
            }
            .${BAR_CLASS} .ermb-badge.${SHIMMER_CLASS} {
                width: 60px !important;
                height: 16px !important;
                background: linear-gradient(90deg, #eee 25%, #ddd 50%, #eee 75%) !important;
                background-size: 200% 100% !important;
                animation: ermb-shimmer-sweep 1.4s ease-in-out infinite !important;
                border: 1px solid #e0e0e0 !important;
                color: transparent !important;
            }
            .${BAR_CLASS} .ermb-badge.${LOADED_CLASS} {
                animation: ermb-fade-in 0.3s ease-out forwards !important;
            }

            /* ── Listing ID label ── */
            .${BAR_CLASS} .ermb-id {
                margin-left: auto !important;
                font-size: 9px !important;
                color: #bbb !important;
                white-space: nowrap !important;
            }
        `;
        document.head.appendChild(style);
    }

    // ─── Data Extraction Helpers ─────────────────────────────────────────────

    function parseNumber(text) {
        if (!text) return null;
        const cleaned = text.replace(/,/g, '').match(/\d+/);
        return cleaned ? parseInt(cleaned[0], 10) : null;
    }

    function formatNum(n) {
        if (n == null) return null;
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
        return n.toLocaleString();
    }

    // ─── Card Finder (broad, multi-strategy) ─────────────────────────────────

    function findAllCards() {
        const notInjected = ':not([' + BAR_ATTR + '])';

        // Strategy 1: data-listing-id attribute (traditional & still common)
        let cards = document.querySelectorAll('[data-listing-id]' + notInjected);
        if (cards.length > 0) { console.log('[EtsyResearch] findAllCards: Strategy 1 (data-listing-id) matched', cards.length); return cards; }

        // Strategy 2: data-palette-listing-id (some A/B test layouts)
        cards = document.querySelectorAll('[data-palette-listing-id]' + notInjected);
        if (cards.length > 0) { console.log('[EtsyResearch] findAllCards: Strategy 2 (data-palette-listing-id) matched', cards.length); return cards; }

        // Strategy 3: listing card class names (various Etsy versions)
        cards = document.querySelectorAll([
            '.v2-listing-card' + notInjected,
            '.listing-card' + notInjected,
            '[data-listing-card-v2]' + notInjected,
            '[data-listing-card]' + notInjected,
            '.wt-grid__item-xs-6' + notInjected,
        ].join(', '));
        if (cards.length > 0) { console.log('[EtsyResearch] findAllCards: Strategy 3 (listing card classes) matched', cards.length); return cards; }

        // Strategy 4: React/Next.js era — data-appears-component-name or data-search-results children
        cards = document.querySelectorAll([
            '[data-appears-component-name*="listing"]' + notInjected,
            '[data-appears-component-name*="Listing"]' + notInjected,
            '[data-search-results] > div' + notInjected,
            '[data-search-results] > li' + notInjected,
        ].join(', '));
        if (cards.length > 0) { console.log('[EtsyResearch] findAllCards: Strategy 4 (React data attrs) matched', cards.length); return cards; }

        // Strategy 5: search results grid — find <li> or <div> ancestors of listing links
        const listingLinks = document.querySelectorAll('a[href*="/listing/"]:not([' + BAR_ATTR + '-link])');
        if (listingLinks.length === 0) {
            console.warn('[EtsyResearch] findAllCards: No listing links found on page at all!');
            return new Set();
        }

        console.log('[EtsyResearch] findAllCards: Strategy 5 (link ancestry) — found', listingLinks.length, 'listing links');
        const parentCards = new Set();
        listingLinks.forEach(link => {
            link.setAttribute(BAR_ATTR + '-link', '1');
            // Walk up to find a reasonable card container
            let el = link.closest('li')
                || link.closest('[class*="listing"]')
                || link.closest('[class*="card"]')
                || link.closest('[class*="grid"] > *')
                || link.parentElement?.parentElement  // two levels up from the <a>
                || link.parentElement;
            if (el && !el.hasAttribute(BAR_ATTR)) {
                const match = link.href.match(/\/listing\/(\d+)/);
                if (match) {
                    el.setAttribute('data-listing-id', match[1]);
                    parentCards.add(el);
                }
            }
        });
        return parentCards;
    }

    // ─── Extract individual metrics from a card ──────────────────────────────

    function getListingId(card) {
        // Try data attributes first
        if (card.dataset.listingId) return card.dataset.listingId;
        if (card.dataset.paletteListingId) return card.dataset.paletteListingId;
        // Fallback: extract from any listing link inside the card
        const link = card.querySelector('a[href*="/listing/"]');
        if (link) {
            const match = link.href.match(/\/listing\/(\d+)/);
            if (match) return match[1];
        }
        return null;
    }

    function extractPrice(card) {
        const selectors = [
            '.currency-value',
            '[data-testid="price-primary"] .currency-value',
            '.wt-text-title-03.wt-text-bold',
            'p[class*="price"] .currency-value',
            '[class*="price"] .currency-value',
            'span[class*="currency-value"]',
            'span[class*="currency"]',
        ];
        for (const sel of selectors) {
            const el = card.querySelector(sel);
            if (el && el.textContent.trim()) {
                return parseFloat(el.textContent.replace(/[^0-9.]/g, '').trim());
            }
        }
        // Fallback: try to find a price-like pattern in the card text
        const text = card.textContent || '';
        const priceMatch = text.match(/[£$€]\s*([\d,.]+)/);
        if (priceMatch) return parseFloat(priceMatch[1].replace(/,/g, ''));
        return null;
    }

    function extractCurrency(card) {
        const currEl = card.querySelector('.currency-symbol, [class*="currency-symbol"]');
        if (currEl) return currEl.textContent.trim();
        // Detect from card text
        const text = card.textContent || '';
        const m = text.match(/[£$€¥₹]/);
        if (m) return m[0];
        return '';
    }

    function extractFavorites(card) {
        const selectors = [
            '[data-listing-card-favorite-count]',
            '[class*="favorite-count"]',
            'button[class*="favorite"] span',
            'button[aria-label*="avourite"] span',
            'button[aria-label*="avorite"] span',
        ];
        for (const sel of selectors) {
            const el = card.querySelector(sel);
            if (el) {
                const num = parseNumber(el.textContent);
                if (num !== null) return num;
            }
        }
        return null;
    }

    function extractReviews(card) {
        const selectors = [
            '[data-testid="review-count"]',
            '[class*="review-count"]',
            '[aria-label*="star"] + span',
            'span[class*="rating"]',
        ];
        for (const sel of selectors) {
            const el = card.querySelector(sel);
            if (el) {
                const num = parseNumber(el.textContent);
                if (num !== null) return num;
            }
        }
        return null;
    }

    function extractRating(card) {
        const el = card.querySelector('[aria-label*="star"], [aria-label*="Star"]');
        if (el) {
            const aria = el.getAttribute('aria-label') || '';
            const m = aria.match(/([\d.]+)\s*star/i);
            if (m) return parseFloat(m[1]);
        }
        return null;
    }

    function extractBadges(card) {
        const text = card.textContent.toLowerCase();
        return {
            is_bestseller: text.includes('bestseller'),
            is_popular_now: text.includes('popular now'),
            free_shipping: text.includes('free shipping') || text.includes('free delivery'),
        };
    }

    // ─── Skeleton Bar Builder ────────────────────────────────────────────────

    function createSkeletonBar(listingId) {
        const bar = document.createElement('div');
        bar.className = BAR_CLASS;

        // Metric slots in order — all start as shimmer
        const slots = [
            { id: 'price', icon: '💰', label: 'Price' },
            { id: 'favs', icon: '❤️', label: 'Favs' },
            { id: 'reviews', icon: '💬', label: 'Reviews' },
            { id: 'shipping', icon: '🚚', label: 'Ship' },
        ];

        for (const slot of slots) {
            const chip = document.createElement('span');
            chip.className = `ermb-chip ${SHIMMER_CLASS}`;
            chip.dataset.slot = slot.id;
            chip.innerHTML = `
                <span class="ermb-label">${slot.icon}</span>
                <span class="ermb-value">&nbsp;</span>
            `;
            bar.appendChild(chip);
        }

        // Badge placeholders
        const badgeSlot1 = document.createElement('span');
        badgeSlot1.className = `ermb-badge ${SHIMMER_CLASS}`;
        badgeSlot1.dataset.slot = 'badge1';
        badgeSlot1.textContent = '\u00A0';
        bar.appendChild(badgeSlot1);

        // Listing ID (always show immediately)
        if (listingId) {
            const idSpan = document.createElement('span');
            idSpan.className = 'ermb-id';
            idSpan.textContent = `ID: ${listingId}`;
            bar.appendChild(idSpan);
        }

        return bar;
    }

    // ─── Progressive data fill ───────────────────────────────────────────────

    function fillSlot(bar, slotId, icon, displayValue, extraClass) {
        const chip = bar.querySelector(`[data-slot="${slotId}"]`);
        if (!chip) return;

        if (displayValue === null || displayValue === undefined) {
            // No data available — hide this chip entirely
            chip.style.display = 'none';
            return;
        }

        chip.classList.remove(SHIMMER_CLASS);
        chip.classList.add(LOADED_CLASS);
        if (extraClass) chip.classList.add(extraClass);
        chip.innerHTML = `
            <span class="ermb-label">${icon}</span>
            <span class="ermb-value">${displayValue}</span>
        `;
    }

    function fillBadgeSlot(bar, slotId, badgeType, icon, label) {
        const badge = bar.querySelector(`[data-slot="${slotId}"]`);
        if (!badge) return;

        if (!label) {
            badge.style.display = 'none';
            return;
        }

        badge.classList.remove(SHIMMER_CLASS);
        badge.classList.add(LOADED_CLASS, badgeType);
        badge.textContent = '';
        badge.innerHTML = `${icon} ${label}`;
    }

    // ─── Progressive extraction + fill for a single card ─────────────────────

    async function progressiveExtract(card, bar) {
        // Use small delays between extractions to stagger the shimmer → value transitions
        // This creates a pleasing "popping in" visual effect

        // 1. Price (fastest — usually in DOM immediately)
        await microDelay(80);
        const price = extractPrice(card);
        const currency = extractCurrency(card);
        if (price != null) {
            fillSlot(bar, 'price', '💰', `${currency}${price.toFixed(2)}`);
        } else {
            fillSlot(bar, 'price', '💰', null);
        }

        // 2. Favorites
        await microDelay(120);
        const favs = extractFavorites(card);
        if (favs != null) {
            fillSlot(bar, 'favs', '❤️', formatNum(favs));
        } else {
            fillSlot(bar, 'favs', '❤️', null);
        }

        // 3. Reviews + rating
        await microDelay(100);
        const reviews = extractReviews(card);
        const rating = extractRating(card);
        if (reviews != null) {
            const starStr = rating != null ? `${rating}⭐ ` : '';
            fillSlot(bar, 'reviews', `${starStr}💬`, `${formatNum(reviews)} reviews`);
        } else {
            fillSlot(bar, 'reviews', '💬', null);
        }

        // 4. Badges + Shipping
        await microDelay(80);
        const badges = extractBadges(card);

        if (badges.free_shipping) {
            fillSlot(bar, 'shipping', '🚚', 'Free Ship');
        } else {
            fillSlot(bar, 'shipping', '🚚', null);
        }

        if (badges.is_bestseller) {
            fillBadgeSlot(bar, 'badge1', 'bestseller', '🏅', 'Bestseller');
        } else if (badges.is_popular_now) {
            fillBadgeSlot(bar, 'badge1', 'popular', '🔥', 'Popular');
        } else {
            fillBadgeSlot(bar, 'badge1', '', '', null);
        }
    }

    function microDelay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── Injection into card ─────────────────────────────────────────────────

    function injectBarIntoCard(card) {
        if (card.hasAttribute(BAR_ATTR)) return;
        card.setAttribute(BAR_ATTR, '1');

        const listingId = getListingId(card);

        // 1. Create and inject skeleton bar IMMEDIATELY
        const bar = createSkeletonBar(listingId);
        insertBarIntoCard(card, bar);

        // 2. Start progressive extraction in background
        progressiveExtract(card, bar).catch(err => {
            console.warn('[EtsyResearch] search-card-injector: Progressive extract error', err);
        });
    }

    function insertBarIntoCard(card, bar) {
        // Try insertion targets in order of specificity
        const insertionTargets = [
            '[class*="listing-card__info"]',
            '.v2-listing-card__info',
            '[data-testid="listing-card-title"]',
            '[data-testid="listing-link"]',
            '.v2-listing-card__img',
            'a[class*="listing-link"]',
            'a[href*="/listing/"]',   // broad fallback: after any listing link
        ];

        for (const sel of insertionTargets) {
            const target = card.querySelector(sel);
            if (target) {
                target.insertAdjacentElement('afterend', bar);
                return;
            }
        }

        // Fallback: append to the end of the card
        card.appendChild(bar);
    }

    // ─── Process all visible cards ───────────────────────────────────────────

    function processAllCards() {
        const cards = findAllCards();
        const count = cards instanceof NodeList ? cards.length : cards.size;
        if (count === 0) return 0;

        cards.forEach(card => injectBarIntoCard(card));
        console.log(`[EtsyResearch] search-card-injector: Processed ${count} cards`);
        return count;
    }

    // ─── MutationObserver for dynamically loaded cards ────────────────────────

    function startObserver() {
        const observer = new MutationObserver((mutations) => {
            let hasNew = false;
            for (const m of mutations) {
                if (m.addedNodes.length > 0) { hasNew = true; break; }
            }
            if (hasNew) {
                clearTimeout(startObserver._timer);
                startObserver._timer = setTimeout(processAllCards, 300);
            }
        });

        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
        });
    }

    // ─── Diagnostic Banner ───────────────────────────────────────────────────
    // Injects a small visible indicator so you can confirm the extension loaded

    function showDiagnosticBanner(cardCount) {
        const existing = document.getElementById('etsy-research-diagnostic');
        if (existing) existing.remove();

        const banner = document.createElement('div');
        banner.id = 'etsy-research-diagnostic';
        banner.setAttribute('data-etsy-research', 'active');
        banner.style.cssText = [
            'position:fixed', 'bottom:10px', 'right:10px', 'z-index:999999',
            'background:#222', 'color:#0f0', 'padding:8px 14px',
            'border-radius:8px', 'font-size:12px', 'font-family:monospace',
            'box-shadow:0 2px 12px rgba(0,0,0,0.4)', 'cursor:pointer',
            'opacity:0.9', 'max-width:320px',
        ].join(';');
        banner.innerHTML = `🔬 <b>EtsyResearch</b> loaded | Cards: ${cardCount}`;
        banner.title = 'Click to dismiss';
        banner.addEventListener('click', () => banner.remove());

        // Auto-hide after 15 seconds
        setTimeout(() => { if (banner.parentNode) banner.remove(); }, 15000);

        document.body.appendChild(banner);
    }

    // ─── Retry mechanism ─────────────────────────────────────────────────────
    // If no cards found initially, retry a few times as Etsy loads content

    function initWithRetry(attempt) {
        const MAX_ATTEMPTS = 15;
        const RETRY_DELAY = 1000; // ms

        const count = processAllCards();

        // Check if we found any cards
        const injected = document.querySelectorAll('[' + BAR_ATTR + '="1"]');
        if (injected.length === 0 && attempt < MAX_ATTEMPTS) {
            console.log(`[EtsyResearch] search-card-injector: No cards found yet, retry ${attempt + 1}/${MAX_ATTEMPTS}`);

            // On later retries, dump some DOM diagnostic info
            if (attempt === 3) {
                console.log('[EtsyResearch] DOM diagnostic: listing links on page =',
                    document.querySelectorAll('a[href*="/listing/"]').length);
                console.log('[EtsyResearch] DOM diagnostic: document.body child count =',
                    document.body ? document.body.children.length : 'no body');
                console.log('[EtsyResearch] DOM diagnostic: URL =', window.location.href);
            }

            setTimeout(() => initWithRetry(attempt + 1), RETRY_DELAY);
        } else {
            console.log(`[EtsyResearch] search-card-injector: Found ${injected.length} cards after ${attempt + 1} attempt(s)`);
            showDiagnosticBanner(injected.length);
        }
    }

    // ─── Init ─────────────────────────────────────────────────────────────────

    function init() {
        console.log('[EtsyResearch] search-card-injector: STARTING on', window.location.href);
        injectMiniBarStyles();
        initWithRetry(0);
        startObserver();
        console.log('[EtsyResearch] search-card-injector: Initialized — monitoring for cards.');
    }

    // Start as soon as possible
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Already past DOMContentLoaded — run immediately (with a tiny delay for safety)
        setTimeout(init, 100);
    }

})();
