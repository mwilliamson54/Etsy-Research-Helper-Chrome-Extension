// content/ui-injector.js
// Injects the research info bar into Etsy listing pages.
// Listens for RENDER_BAR and PREFS_UPDATED messages from the service worker.

(function () {
    'use strict';

    // Supports regional paths like /uk/listing/, /de/listing/, etc.
    if (!/etsy\.com\/(?:[a-z]{2}\/)?listing\//.test(window.location.href)) return;

    const BAR_ID = 'etsy-research-bar-root';

    const DEFAULT_THEME = 'default';
    const DEFAULT_VISIBLE_METRICS = {
        shopAge: true,
        shopSales: true,
        totalListings: true,
        estListingSales: true,
        confidenceScore: true,
        listingAge: true,
        listingReviews: true,
        listingFavorites: true,
    };

    let currentData = null;
    let currentTheme = DEFAULT_THEME;
    let currentMetrics = { ...DEFAULT_VISIBLE_METRICS };

    // Buffer for RENDER_BAR messages that arrive before init() creates the DOM element
    let pendingRenderData = null;

    // ─── CSS Injection ────────────────────────────────────────────────────────

    function injectStylesheet(href, id) {
        if (document.getElementById(id)) return;
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }

    function applyTheme(theme) {
        // Remove existing theme link
        const existing = document.getElementById('etsy-research-theme-css');
        if (existing) existing.remove();

        const validThemes = ['default', 'dark', 'minimal', 'bold'];
        const safeTheme = validThemes.includes(theme) ? theme : 'default';
        const themeUrl = chrome.runtime.getURL(`themes/theme-${safeTheme}.css`);
        injectStylesheet(themeUrl, 'etsy-research-theme-css');
        currentTheme = safeTheme;
    }

    function applyBaseStyles() {
        const baseUrl = chrome.runtime.getURL('ui/info-bar.css');
        injectStylesheet(baseUrl, 'etsy-research-base-css');
    }

    // ─── Bar Rendering ────────────────────────────────────────────────────────

    function formatNumber(n) {
        if (n == null) return '—';
        return n.toLocaleString();
    }

    function buildMetricHTML(icon, label, value) {
        return `
      <div class="etsy-research-bar__metric">
        <span class="etsy-research-bar__icon">${icon}</span>
        <span class="etsy-research-bar__label">${label}:</span>
        <span class="etsy-research-bar__value">${value}</span>
      </div>`;
    }

    function buildBarHTML(data, metrics) {
        const parts = [];

        if (metrics.shopAge && data.shop_age_display) {
            parts.push(buildMetricHTML('🛒', 'Shop Age', data.shop_age_display));
        }
        if (metrics.shopSales && data.total_shop_sales != null) {
            parts.push(buildMetricHTML('📊', 'Shop Sales', `~${formatNumber(data.total_shop_sales)}`));
        }
        if (metrics.totalListings && data.total_shop_listings != null) {
            parts.push(buildMetricHTML('📦', 'Listings', formatNumber(data.total_shop_listings)));
        }
        if (metrics.estListingSales && data.estimated_listing_sales != null) {
            const range = `est. ${formatNumber(data.estimated_sales_low)}–${formatNumber(data.estimated_sales_high)}`;
            parts.push(buildMetricHTML('🔥', 'Est. Sales', range));
        }
        if (metrics.confidenceScore && data.confidence_score != null) {
            parts.push(buildMetricHTML('⭐', 'Confidence', `${data.confidence_score}%`));
        }
        if (metrics.listingAge && data.listing_age_display) {
            parts.push(buildMetricHTML('📅', 'Listed', data.listing_age_display + ' ago'));
        }
        if (metrics.listingFavorites && data.listing_favorites != null) {
            parts.push(buildMetricHTML('❤️', 'Favorites', formatNumber(data.listing_favorites)));
        }
        if (metrics.listingReviews && data.listing_reviews != null) {
            parts.push(buildMetricHTML('💬', 'Reviews', formatNumber(data.listing_reviews)));
        }

        if (parts.length === 0) {
            return `<div class="etsy-research-bar__empty">No metrics selected — open the extension to configure.</div>`;
        }

        return parts.join('');
    }

    function renderBar(data, metrics) {
        let bar = document.getElementById(BAR_ID);
        if (!bar) {
            // Bar not in DOM yet — buffer the data so init() can use it
            pendingRenderData = { data, metrics };
            return;
        }

        bar.classList.remove('etsy-research-bar--loading');
        bar.innerHTML = buildBarHTML(data, metrics);
    }

    function showLoadingBar() {
        let bar = document.getElementById(BAR_ID);
        if (bar) {
            // Already injected — just update state
            if (!pendingRenderData) {
                bar.classList.add('etsy-research-bar--loading');
                bar.innerHTML = `<div class="etsy-research-bar__loading-text">🔍 Analyzing listing...</div>`;
            }
            return;
        }

        bar = document.createElement('div');
        bar.id = BAR_ID;
        bar.className = 'etsy-research-bar etsy-research-bar--loading';
        // Inline fallback so the bar is visible even if CSS fails to load
        bar.style.cssText = [
            'display:flex', 'flex-wrap:wrap', 'align-items:center',
            'width:100%', 'box-sizing:border-box', 'padding:8px 14px',
            'margin:10px 0', 'gap:6px', 'font-size:13px',
            'background:#f9f9f9', 'border:1px solid #ddd',
            'border-radius:6px', 'color:#333', 'z-index:9999',
            'position:relative',
        ].join(';');

        if (pendingRenderData) {
            // Data already arrived before the bar was created — render immediately
            bar.classList.remove('etsy-research-bar--loading');
            bar.innerHTML = buildBarHTML(pendingRenderData.data, pendingRenderData.metrics);
            pendingRenderData = null;
        } else {
            bar.innerHTML = `<div class="etsy-research-bar__loading-text">🔍 Analyzing listing...</div>`;
        }

        injectBarIntoPage(bar);
    }

    // ─── DOM Injection ────────────────────────────────────────────────────────

    function injectBarIntoPage(bar) {
        // Try insertion points in order of preference for Etsy's current layout.
        // We insert AFTER each target so the bar appears below it.
        const insertionSelectors = [
            // Current Etsy (2024-2025) layout selectors
            '[data-testid="listing-page-hero"]',
            '[data-testid="listing-page-image-carousel"]',
            '[data-testid="listing-page-image-carousel-component"]',
            '[data-testid="stick-summary-header-component"]',
            // Price / buy box area
            '[data-buy-box-listing-price]',
            '[data-testid="buy-box-region"]',
            // Breadcrumb / title area
            '[data-testid="listing-page-title"]',
            // Generic fallbacks
            'h1',
            'main > div:first-child',
            'main > section:first-child',
        ];

        for (const sel of insertionSelectors) {
            const target = document.querySelector(sel);
            if (target && target.parentNode) {
                target.insertAdjacentElement('afterend', bar);
                console.log('[EtsyResearch] ui-injector: Bar injected after', sel);
                return true;
            }
        }

        // Absolute last resort — prepend to main or body
        const main = document.querySelector('main') || document.body;
        main.prepend(bar);
        console.log('[EtsyResearch] ui-injector: Bar prepended to main (fallback).');
        return true;
    }

    // ─── Preferences ─────────────────────────────────────────────────────────

    function loadPrefsAndRender(data) {
        chrome.storage.sync.get(['theme', 'visibleMetrics'], (prefs) => {
            const theme = prefs.theme || DEFAULT_THEME;
            const metrics = prefs.visibleMetrics || DEFAULT_VISIBLE_METRICS;
            currentTheme = theme;
            currentMetrics = metrics;
            applyBaseStyles();
            applyTheme(theme);
            renderBar(data, metrics);
        });
    }

    // ─── Message Listener ─────────────────────────────────────────────────────

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'RENDER_BAR') {
            currentData = msg.data;
            loadPrefsAndRender(currentData);
        }

        if (msg.type === 'PREFS_UPDATED') {
            chrome.storage.sync.get(['theme', 'visibleMetrics'], (prefs) => {
                const theme = prefs.theme || DEFAULT_THEME;
                const metrics = prefs.visibleMetrics || DEFAULT_VISIBLE_METRICS;
                applyTheme(theme);
                if (currentData) renderBar(currentData, metrics);
            });
        }
    });

    // ─── Init ─────────────────────────────────────────────────────────────────

    function init() {
        applyBaseStyles();
        showLoadingBar();
    }

    // Wait a moment for the page to paint before injecting
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 600);
    }
})();
