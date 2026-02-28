// popup/popup.js
// Manages popup UI state. Auto-saves preferences on any change and notifies active Etsy tab.

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

// ─── Helpers ──────────────────────────────────────────────────────────────

function showStatus(msg, duration = 1500) {
    const el = document.getElementById('popup-status');
    if (!el) return;
    el.textContent = msg;
    setTimeout(() => { el.textContent = ''; }, duration);
}

// ─── Load Preferences ─────────────────────────────────────────────────────

function loadPreferences() {
    chrome.storage.sync.get(['theme', 'visibleMetrics'], (prefs) => {
        const theme = prefs.theme || DEFAULT_THEME;
        const metrics = prefs.visibleMetrics || DEFAULT_VISIBLE_METRICS;

        // Set active theme radio
        const themeRadio = document.querySelector(`input[name="theme"][value="${theme}"]`);
        if (themeRadio) themeRadio.checked = true;

        // Set each metric checkbox
        document.querySelectorAll('[data-metric]').forEach((checkbox) => {
            const key = checkbox.dataset.metric;
            checkbox.checked = (key in metrics) ? metrics[key] : true;
        });
    });
}

// ─── Read Current Values from UI ──────────────────────────────────────────

function readCurrentPreferences() {
    // Theme
    const selectedThemeEl = document.querySelector('input[name="theme"]:checked');
    const theme = selectedThemeEl ? selectedThemeEl.value : DEFAULT_THEME;

    // Metrics
    const visibleMetrics = {};
    document.querySelectorAll('[data-metric]').forEach((checkbox) => {
        visibleMetrics[checkbox.dataset.metric] = checkbox.checked;
    });

    return { theme, visibleMetrics };
}

// ─── Save & Notify ────────────────────────────────────────────────────────

function saveAndNotify() {
    const prefs = readCurrentPreferences();

    chrome.storage.sync.set(prefs, () => {
        showStatus('✓ Saved');

        // Notify active Etsy listing tab to re-render bar
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || tabs.length === 0) return;
            const activeTab = tabs[0];
            if (!activeTab.url || !activeTab.url.includes('etsy.com/listing/')) return;

            chrome.tabs.sendMessage(activeTab.id, { type: 'PREFS_UPDATED' }, () => {
                // Ignore errors — content script may not be loaded yet
                if (chrome.runtime.lastError) { /* silent */ }
            });
        });
    });
}

// ─── Event Listeners ──────────────────────────────────────────────────────

function attachListeners() {
    // Auto-save on any radio change (theme)
    document.querySelectorAll('input[name="theme"]').forEach((radio) => {
        radio.addEventListener('change', saveAndNotify);
    });

    // Auto-save on any checkbox change (metrics)
    document.querySelectorAll('[data-metric]').forEach((checkbox) => {
        checkbox.addEventListener('change', saveAndNotify);
    });
}

// ─── Init ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadPreferences();
    attachListeners();
});
