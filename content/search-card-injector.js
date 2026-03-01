// content/search-card-injector.js
// FULLY SELF-CONTAINED.
// For the first 8 cards: extracts shop URL, requests shop data from service worker,
// and fills extra metrics (shop age, shop sales, est. sales, confidence) into the bar.

(function () {
    'use strict';

    // Exit on individual listing pages
    if (/etsy\.com\/(?:[a-z]{2}\/)?listing\//.test(window.location.href)) return;

    var BAR_CLASS   = 'etsy-research-mini-bar';
    var BAR_ATTR    = 'data-erbar-injected';
    var SHIMMER_CLS = 'ermb-shimmer';
    var LOADED_CLS  = 'ermb-loaded';

    // How many cards to deep-scrape via service worker
    var MAX_DEEP_SCRAPE = 8;

    // Map of listing_id → bar element, so we can update the bar when shop data arrives
    var barsByListingId = {};

    // ── Inject CSS ────────────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('etsy-research-mini-bar-style')) return;
        var s = document.createElement('style');
        s.id = 'etsy-research-mini-bar-style';
        s.textContent = [
            '@keyframes ermb-shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}',
            '@keyframes ermb-fadein{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:translateY(0)}}',

            '.' + BAR_CLASS + '{',
            '  display:flex!important;flex-wrap:wrap!important;align-items:center!important;',
            '  gap:4px 6px!important;width:100%!important;box-sizing:border-box!important;',
            '  padding:5px 8px!important;margin-top:6px!important;margin-bottom:2px!important;',
            '  background:#f8f8f8!important;border:1px solid #e0e0e0!important;',
            '  border-radius:6px!important;',
            '  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif!important;',
            '  font-size:11px!important;color:#444!important;line-height:1.3!important;',
            '  min-height:26px!important;position:relative!important;z-index:10!important;',
            '}',

            '.' + BAR_CLASS + ' .ermb-chip{',
            '  display:inline-flex!important;align-items:center!important;gap:3px!important;',
            '  background:#fff!important;border:1px solid #e5e5e5!important;border-radius:4px!important;',
            '  padding:2px 6px!important;white-space:nowrap!important;font-size:11px!important;',
            '  color:#555!important;min-height:18px!important;',
            '}',
            '.' + BAR_CLASS + ' .ermb-label{color:#999!important;font-size:10px!important;}',
            '.' + BAR_CLASS + ' .ermb-value{font-weight:600!important;color:#222!important;font-size:11px!important;}',

            // Shimmer animation on value span
            '.' + BAR_CLASS + ' .' + SHIMMER_CLS + ' .ermb-value{',
            '  display:inline-block!important;width:36px!important;height:12px!important;',
            '  border-radius:3px!important;',
            '  background:linear-gradient(90deg,#eee 25%,#ddd 50%,#eee 75%)!important;',
            '  background-size:200% 100%!important;',
            '  animation:ermb-shimmer 1.4s ease-in-out infinite!important;',
            '  color:transparent!important;',
            '}',

            '.' + BAR_CLASS + ' .' + LOADED_CLS + ' .ermb-value{',
            '  animation:ermb-fadein 0.3s ease-out forwards!important;',
            '  width:auto!important;height:auto!important;background:none!important;color:#222!important;',
            '}',

            // Deep-scrape chips get a slightly different background to distinguish them
            '.' + BAR_CLASS + ' .ermb-chip.ermb-deep{',
            '  background:#f0f7ff!important;border-color:#c8e0f7!important;',
            '}',
            '.' + BAR_CLASS + ' .ermb-chip.ermb-deep .ermb-label{color:#6ba3cb!important;}',
            '.' + BAR_CLASS + ' .ermb-chip.ermb-deep .ermb-value{color:#1a5a8a!important;}',

            // Separator between card-data chips and shop-data chips
            '.' + BAR_CLASS + ' .ermb-sep{',
            '  display:inline-block!important;width:1px!important;height:16px!important;',
            '  background:#ddd!important;margin:0 2px!important;flex-shrink:0!important;',
            '}',

            '.' + BAR_CLASS + ' .ermb-badge{',
            '  display:inline-flex!important;align-items:center!important;gap:2px!important;',
            '  border-radius:4px!important;padding:2px 5px!important;',
            '  font-size:10px!important;font-weight:600!important;white-space:nowrap!important;',
            '}',
            '.' + BAR_CLASS + ' .ermb-badge.bestseller{background:#fff3cd!important;color:#856404!important;border:1px solid #ffc107!important;}',
            '.' + BAR_CLASS + ' .ermb-badge.popular{background:#fde9ee!important;color:#c0123c!important;border:1px solid #fbd3dc!important;}',
            '.' + BAR_CLASS + ' .ermb-badge.' + SHIMMER_CLS + '{',
            '  width:60px!important;height:16px!important;',
            '  background:linear-gradient(90deg,#eee 25%,#ddd 50%,#eee 75%)!important;',
            '  background-size:200% 100%!important;',
            '  animation:ermb-shimmer 1.4s ease-in-out infinite!important;',
            '  border:1px solid #e0e0e0!important;color:transparent!important;',
            '}',
            '.' + BAR_CLASS + ' .ermb-badge.' + LOADED_CLS + '{animation:ermb-fadein 0.3s ease-out forwards!important;}',
            '.' + BAR_CLASS + ' .ermb-id{margin-left:auto!important;font-size:9px!important;color:#bbb!important;}',

            // Confidence score colour coding
            '.' + BAR_CLASS + ' .ermb-conf-high{color:#2a7a2a!important;font-weight:700!important;}',
            '.' + BAR_CLASS + ' .ermb-conf-med{color:#a06000!important;font-weight:700!important;}',
            '.' + BAR_CLASS + ' .ermb-conf-low{color:#a00000!important;font-weight:700!important;}',

            // Let the <li> grid item grow to fit the bar
            'li.wt-grid__item-xs-6{height:auto!important;align-self:start!important;}',
        ].join('\n');

        if (document.head) {
            document.head.appendChild(s);
        } else {
            document.addEventListener('DOMContentLoaded', function () {
                document.head.appendChild(s);
            });
        }
    }

    // ── Utilities ─────────────────────────────────────────────────────────────
    function parseNum(text) {
        if (!text) return null;
        var m = text.replace(/,/g, '').match(/\d+/);
        return m ? parseInt(m[0], 10) : null;
    }

    function fmtNum(n) {
        if (n == null) return null;
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000)    return (n / 1000).toFixed(1) + 'k';
        return n.toLocaleString();
    }

    function getListingId(el) {
        if (el.dataset && el.dataset.listingId)        return el.dataset.listingId;
        if (el.dataset && el.dataset.paletteListingId) return el.dataset.paletteListingId;
        var a = el.querySelector('a[href*="/listing/"]');
        if (a) { var m = a.href.match(/\/listing\/(\d+)/); if (m) return m[1]; }
        return null;
    }

    // Extract the shop URL from a card
    // Etsy puts it in data-shop-url or in links containing /shop/
    function getShopUrl(card) {
        // data-shop-url attribute (on seller name span)
        var el = card.querySelector('[data-shop-url]');
        if (el) {
            var u = el.getAttribute('data-shop-url');
            if (u && u.indexOf('/shop/') !== -1) return normaliseShopUrl(u);
        }

        // Link with /shop/ in href
        var links = card.querySelectorAll('a[href*="/shop/"]');
        for (var i = 0; i < links.length; i++) {
            var href = links[i].href || '';
            // Skip Etsy generic shop nav links
            if (/\/(yourEtsy|updates|favorites|sold|listings)/.test(href)) continue;
            var m = href.match(/(https:\/\/www\.etsy\.com\/(?:[a-z]{2}\/)?shop\/([^/?#]+))/);
            if (m) return normaliseShopUrl(m[1]);
        }
        return null;
    }

    // Normalise to non-regional URL so cache keys are consistent
    // e.g. https://www.etsy.com/uk/shop/Foo → https://www.etsy.com/shop/Foo
    function normaliseShopUrl(url) {
        return url.replace(/etsy\.com\/[a-z]{2}\/shop\//, 'etsy.com/shop/');
    }

    function closest(el, sel) {
        while (el && el !== document) {
            try { if (el.matches && el.matches(sel)) return el; } catch(e) {}
            el = el.parentElement;
        }
        return null;
    }

    // ── Find card roots ───────────────────────────────────────────────────────
    function findCards() {
        var NOT = ':not([' + BAR_ATTR + '])';
        var cards;

        cards = document.querySelectorAll('.v2-listing-card' + NOT);
        if (cards.length) { return Array.prototype.slice.call(cards); }

        cards = document.querySelectorAll('[data-palette-listing-id]' + NOT);
        if (cards.length) { return Array.prototype.slice.call(cards); }

        cards = document.querySelectorAll('[data-listing-card-v2]' + NOT + ',[data-listing-card]' + NOT);
        if (cards.length) { return Array.prototype.slice.call(cards); }

        // Walk up from listing links
        var links = document.querySelectorAll('a[href*="/listing/"]');
        var seen  = {};
        var result = [];
        for (var i = 0; i < links.length; i++) {
            var match = links[i].href.match(/\/listing\/(\d+)/);
            if (!match || seen[match[1]]) continue;
            seen[match[1]] = true;
            var c = closest(links[i], '.v2-listing-card') ||
                    closest(links[i], '[class*="listing-card"]') ||
                    closest(links[i], 'li');
            if (c && !c.hasAttribute(BAR_ATTR)) result.push(c);
        }
        return result;
    }

    // ── Metric extractors (from card DOM) ─────────────────────────────────────
    function extractPrice(card) {
        var sels = ['.currency-value', '[class*="price"] .currency-value', 'span[class*="currency-value"]'];
        for (var i = 0; i < sels.length; i++) {
            var el = card.querySelector(sels[i]);
            if (el && el.textContent.trim()) {
                var v = parseFloat(el.textContent.replace(/[^0-9.]/g, ''));
                if (!isNaN(v)) return v;
            }
        }
        var m = (card.textContent || '').match(/[£$€]\s*([\d,.]+)/);
        return m ? parseFloat(m[1].replace(/,/g, '')) : null;
    }

    function extractCurrency(card) {
        var sym = card.querySelector('.currency-symbol,[class*="currency-symbol"]');
        if (sym) return sym.textContent.trim();
        var m = (card.textContent || '').match(/[£$€¥₹]/);
        return m ? m[0] : '';
    }

    function extractFavorites(card) {
        var sels = ['[data-listing-card-favorite-count]','[class*="favorite-count"]',
                    'button[aria-label*="avourite"] span','button[aria-label*="avorite"] span'];
        for (var i = 0; i < sels.length; i++) {
            var el = card.querySelector(sels[i]);
            if (el) { var n = parseNum(el.textContent); if (n !== null) return n; }
        }
        return null;
    }

    function extractReviews(card) {
        var rDiv = card.querySelector('div[role="img"][aria-label*="star"]');
        if (rDiv) {
            var label = rDiv.getAttribute('aria-label') || '';
            var m = label.match(/(\d[\d,]*)\s+reviews?/i);
            if (m) return parseNum(m[1]);
            var p = rDiv.querySelector('p');
            if (p) { var n = parseNum(p.textContent); if (n !== null) return n; }
        }
        var smalls = card.querySelectorAll('p.wt-text-body-smaller,span.wt-text-body-smaller');
        for (var i = 0; i < smalls.length; i++) {
            var t = smalls[i].textContent.trim();
            if (/^\(\d+\)$/.test(t)) { var n2 = parseNum(t); if (n2 !== null) return n2; }
        }
        return null;
    }

    function extractRating(card) {
        var span = card.querySelector('span.wt-text-title-small');
        if (span) { var v = parseFloat(span.textContent.trim()); if (!isNaN(v) && v >= 1 && v <= 5) return v; }
        var rDiv = card.querySelector('div[role="img"][aria-label*="star"]');
        if (rDiv) {
            var m = (rDiv.getAttribute('aria-label') || '').match(/([\d.]+)\s*star/i);
            if (m) return parseFloat(m[1]);
        }
        return null;
    }

    function extractBadges(card) {
        var t = (card.textContent || '').toLowerCase();
        return {
            bestseller:    t.indexOf('bestseller') !== -1,
            popular_now:   t.indexOf('popular now') !== -1,
            free_shipping: t.indexOf('free shipping') !== -1 || t.indexOf('free delivery') !== -1,
        };
    }

    // ── Build bar ─────────────────────────────────────────────────────────────
    // deepMode = true means we add the extra shop-data chip placeholders
    function makeBar(listingId, deepMode) {
        var bar = document.createElement('div');
        bar.className = BAR_CLASS;
        bar.setAttribute('data-listing-id-bar', listingId || '');

        // ── Row 1: card-level data (always shown) ──
        var cardSlots = [
            { id: 'price',    icon: '💰' },
            { id: 'favs',     icon: '❤️' },
            { id: 'reviews',  icon: '💬' },
            { id: 'shipping', icon: '🚚' },
        ];
        for (var i = 0; i < cardSlots.length; i++) {
            var chip = document.createElement('span');
            chip.className = 'ermb-chip ' + SHIMMER_CLS;
            chip.setAttribute('data-slot', cardSlots[i].id);
            chip.innerHTML = '<span class="ermb-label">' + cardSlots[i].icon + '</span>'
                           + '<span class="ermb-value">&nbsp;</span>';
            bar.appendChild(chip);
        }

        var badge = document.createElement('span');
        badge.className = 'ermb-badge ' + SHIMMER_CLS;
        badge.setAttribute('data-slot', 'badge1');
        badge.textContent = '\u00A0';
        bar.appendChild(badge);

        // ── Separator + deep-scrape placeholders ──
        if (deepMode) {
            var sep = document.createElement('span');
            sep.className = 'ermb-sep';
            bar.appendChild(sep);

            var deepSlots = [
                { id: 'shop-age',   icon: '🛒', label: 'Shop Age' },
                { id: 'shop-sales', icon: '📊', label: 'Shop Sales' },
                { id: 'est-sales',  icon: '🔥', label: 'Est. Sales' },
                { id: 'confidence', icon: '⭐', label: 'Confidence' },
            ];
            for (var j = 0; j < deepSlots.length; j++) {
                var dc = document.createElement('span');
                dc.className = 'ermb-chip ermb-deep ' + SHIMMER_CLS;
                dc.setAttribute('data-slot', deepSlots[j].id);
                dc.innerHTML = '<span class="ermb-label">' + deepSlots[j].icon + '</span>'
                             + '<span class="ermb-value">&nbsp;</span>';
                bar.appendChild(dc);
            }
        }

        if (listingId) {
            var idEl = document.createElement('span');
            idEl.className = 'ermb-id';
            idEl.textContent = 'ID: ' + listingId;
            bar.appendChild(idEl);
        }
        return bar;
    }

    // ── Fill a slot with a value ──────────────────────────────────────────────
    function fillSlot(bar, slotId, icon, value, extraClass) {
        var chip = bar.querySelector('[data-slot="' + slotId + '"]');
        if (!chip) return;
        if (value === null || value === undefined) { chip.style.display = 'none'; return; }
        chip.classList.remove(SHIMMER_CLS);
        chip.classList.add(LOADED_CLS);
        chip.innerHTML = '<span class="ermb-label">' + icon + '</span>'
                       + '<span class="ermb-value' + (extraClass ? ' ' + extraClass : '') + '">' + value + '</span>';
    }

    function fillBadge(bar, slotId, type, icon, label) {
        var badge = bar.querySelector('[data-slot="' + slotId + '"]');
        if (!badge) return;
        if (!label) { badge.style.display = 'none'; return; }
        badge.classList.remove(SHIMMER_CLS);
        badge.classList.add(LOADED_CLS);
        if (type) badge.classList.add(type);
        badge.innerHTML = icon + ' ' + label;
    }

    // ── Fill card-level data (from DOM, fast) ─────────────────────────────────
    function fillCardData(card, bar) {
        setTimeout(function () {
            var price = extractPrice(card);
            var cur   = extractCurrency(card);
            fillSlot(bar, 'price', '💰', price != null ? cur + price.toFixed(2) : null);
        }, 80);

        setTimeout(function () {
            var favs = extractFavorites(card);
            fillSlot(bar, 'favs', '❤️', favs != null ? fmtNum(favs) : null);
        }, 160);

        setTimeout(function () {
            var reviews = extractReviews(card);
            var rating  = extractRating(card);
            if (reviews != null) {
                var icon = rating != null ? (rating + '⭐ 💬') : '💬';
                fillSlot(bar, 'reviews', icon, fmtNum(reviews) + ' reviews');
            } else {
                fillSlot(bar, 'reviews', '💬', null);
            }
        }, 240);

        setTimeout(function () {
            var b = extractBadges(card);
            fillSlot(bar, 'shipping', '🚚', b.free_shipping ? 'Free Ship' : null);
            if (b.bestseller)       fillBadge(bar, 'badge1', 'bestseller', '🏅', 'Bestseller');
            else if (b.popular_now) fillBadge(bar, 'badge1', 'popular',    '🔥', 'Popular');
            else                    fillBadge(bar, 'badge1', '',            '',   null);
        }, 320);
    }

    // ── Fill deep shop data (from service worker response) ────────────────────
    function fillShopData(bar, data) {
        // Shop age
        fillSlot(bar, 'shop-age', '🛒', data.shop_age_display || null);

        // Shop sales
        fillSlot(bar, 'shop-sales', '📊',
            data.total_shop_sales != null ? '~' + fmtNum(data.total_shop_sales) : null);

        // Estimated listing sales
        if (data.estimated_sales_low != null && data.estimated_sales_high != null) {
            fillSlot(bar, 'est-sales', '🔥',
                fmtNum(data.estimated_sales_low) + '–' + fmtNum(data.estimated_sales_high));
        } else {
            fillSlot(bar, 'est-sales', '🔥', null);
        }

        // Confidence score with colour coding
        if (data.confidence_score != null) {
            var score = data.confidence_score;
            var cls = score >= 70 ? 'ermb-conf-high' : (score >= 40 ? 'ermb-conf-med' : 'ermb-conf-low');
            fillSlot(bar, 'confidence', '⭐', score + '%', cls);
        } else {
            fillSlot(bar, 'confidence', '⭐', null);
        }
    }

    // ── Insert bar into <li> parent ───────────────────────────────────────────
    function insertBar(card, bar) {
        var li = closest(card, 'li');
        if (li) { li.appendChild(bar); return; }
        if (card.parentNode) { card.parentNode.insertBefore(bar, card.nextSibling); return; }
        card.appendChild(bar);
    }

    // ── Listen for shop data back from service worker ─────────────────────────
    try {
        chrome.runtime.onMessage.addListener(function (msg) {
            if (msg.type !== 'SERP_SHOP_DATA') return;
            var listingId = msg.listing_id;
            var bar = barsByListingId[listingId];
            if (!bar) return;
            if (msg.data) {
                fillShopData(bar, msg.data);
            } else {
                // Scrape failed — hide the deep placeholders gracefully
                var deepSlots = ['shop-age', 'shop-sales', 'est-sales', 'confidence'];
                for (var i = 0; i < deepSlots.length; i++) {
                    var chip = bar.querySelector('[data-slot="' + deepSlots[i] + '"]');
                    if (chip) chip.style.display = 'none';
                }
                var sep = bar.querySelector('.ermb-sep');
                if (sep) sep.style.display = 'none';
            }
        });
    } catch(e) {
        // chrome.runtime not available (e.g. extension context invalidated)
        console.warn('[EtsyResearch] Could not attach message listener:', e);
    }

    // ── Request shop data from service worker ─────────────────────────────────
    function requestShopData(listingId, shopUrl, listingData) {
        try {
            chrome.runtime.sendMessage({
                type: 'SERP_LISTING_REQUEST',
                listing_id: listingId,
                shop_url:   shopUrl,
                listing_data: listingData,
            });
        } catch(e) {
            console.warn('[EtsyResearch] sendMessage failed:', e);
        }
    }

    // ── Process one card ──────────────────────────────────────────────────────
    function processCard(card, cardIndex) {
        if (card.hasAttribute(BAR_ATTR)) return;
        card.setAttribute(BAR_ATTR, '1');

        var listingId = getListingId(card);
        var deepMode  = cardIndex < MAX_DEEP_SCRAPE;
        var shopUrl   = deepMode ? getShopUrl(card) : null;

        // If we wanted deep but couldn't find shop URL, fall back to shallow
        if (deepMode && !shopUrl) deepMode = false;

        var bar = makeBar(listingId, deepMode);
        insertBar(card, bar);

        // Register bar so we can update it when shop data arrives
        if (listingId) barsByListingId[listingId] = bar;

        // Fill card-level data immediately from DOM
        fillCardData(card, bar);

        // Request deep shop data from service worker for first 8 cards
        if (deepMode && listingId && shopUrl) {
            // Collect what listing data we can from the card to help the estimator
            var listingData = {
                listing_id:          listingId,
                shop_url:            shopUrl,
                listing_price:       extractPrice(card),
                listing_currency:    extractCurrency(card),
                listing_favorites:   extractFavorites(card),
                listing_reviews:     extractReviews(card),
                is_bestseller:       extractBadges(card).bestseller,
                is_popular_now:      extractBadges(card).popular_now,
                listing_publish_date: null, // not visible on SERP cards
            };
            requestShopData(listingId, shopUrl, listingData);
        }
    }

    function processAll() {
        var cards = findCards();
        for (var i = 0; i < cards.length; i++) {
            try { processCard(cards[i], i); } catch(e) { /* never crash the loop */ }
        }
        return cards.length;
    }

    // ── MutationObserver ──────────────────────────────────────────────────────
    function startObserver() {
        var timer;
        var obs = new MutationObserver(function () {
            clearTimeout(timer);
            timer = setTimeout(processAll, 400);
        });
        obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }

    // ── Green diagnostic banner ───────────────────────────────────────────────
    function showBanner(count) {
        var ex = document.getElementById('etsy-research-diagnostic');
        if (ex) ex.remove();
        var b = document.createElement('div');
        b.id = 'etsy-research-diagnostic';
        b.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:2147483647;' +
            'background:#222;color:#0f0;padding:8px 14px;border-radius:8px;' +
            'font-size:12px;font-family:monospace;cursor:pointer;' +
            'box-shadow:0 2px 12px rgba(0,0,0,.5);';
        b.innerHTML = '🔬 <b>EtsyResearch</b> | Cards: <b>' + count + '</b> | Deep: <b>' + Math.min(count, MAX_DEEP_SCRAPE) + '</b>';
        b.onclick = function () { b.remove(); };
        setTimeout(function () { if (b.parentNode) b.remove(); }, 20000);
        document.body.appendChild(b);
    }

    // ── Retry loop ────────────────────────────────────────────────────────────
    var retryCount = 0;
    function retry() {
        processAll();
        var injected = document.querySelectorAll('[' + BAR_ATTR + ']').length;
        if (injected === 0 && retryCount < 25) {
            retryCount++;
            setTimeout(retry, 1000);
        } else {
            showBanner(injected);
            console.log('[EtsyResearch] Done — injected', injected, 'bars,', Math.min(injected, MAX_DEEP_SCRAPE), 'with deep scrape.');
        }
    }

    // ── Boot ──────────────────────────────────────────────────────────────────
    function boot() {
        console.log('[EtsyResearch] search-card-injector loaded on', window.location.href);
        injectStyles();
        retry();
        startObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        setTimeout(boot, 50);
    }

})();