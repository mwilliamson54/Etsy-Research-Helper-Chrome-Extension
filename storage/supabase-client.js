// storage/supabase-client.js
//
// FOR PUBLIC RELEASE:
// Replace direct Supabase calls with fetch() calls to a Supabase Edge Function.
// The Edge Function should validate input, apply rate limits, and use service_role key server-side.
// Never expose service_role key in the extension.
//
// This file uses the Supabase JS v2 CDN ESM build loaded via importScripts or dynamic import.
// In a Chrome extension service worker context, we use fetch() directly against the REST API
// since importScripts is limited. The Supabase client is initialized once.

// ─── Initialize ───────────────────────────────────────────────────────────

// We use the Supabase REST API directly via fetch() to avoid bundler requirements.
// This is the safest approach for MV3 service workers.

const SUPABASE_URL = (typeof CONFIG !== 'undefined') ? CONFIG.SUPABASE_URL : 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = (typeof CONFIG !== 'undefined') ? CONFIG.SUPABASE_ANON_KEY : 'YOUR_SUPABASE_ANON_KEY';
const MODE = (typeof CONFIG !== 'undefined' && CONFIG.MODE) ? CONFIG.MODE : 'personal';
const EDGE_FUNCTION_URL = (typeof CONFIG !== 'undefined' && CONFIG.EDGE_FUNCTION_URL)
    ? CONFIG.EDGE_FUNCTION_URL
    : null;

const TABLES = (typeof CONFIG !== 'undefined' && CONFIG.TABLES)
    ? CONFIG.TABLES
    : { LISTINGS: 'listings', SEARCH_SESSIONS: 'search_sessions' };

/**
 * Base headers for Supabase REST API calls.
 */
function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal',
    };
}

/**
 * Route a write to either:
 *  - Direct Supabase REST (personal mode)
 *  - Edge Function (public mode)
 */
async function routedWrite(table, data) {
    if (MODE === 'public' && EDGE_FUNCTION_URL) {
        // Public mode: route through edge function
        const resp = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table, data }),
        });
        if (!resp.ok) throw new Error(`Edge function error: ${resp.status}`);
        return resp.json();
    }

    // Personal mode: direct REST upsert/insert
    return null; // handled by caller
}

// ─── saveListing ─────────────────────────────────────────────────────────

/**
 * Upsert a listing record into Supabase using listing_id as the conflict key.
 * @param {object} listingData
 */
async function saveListing(listingData) {
    try {
        if (MODE === 'public' && EDGE_FUNCTION_URL) {
            await routedWrite(TABLES.LISTINGS, listingData);
            console.log('[EtsyResearch] supabase: saveListing routed to edge function.');
            return;
        }

        const url = `${SUPABASE_URL}/rest/v1/${TABLES.LISTINGS}`;
        const headers = {
            ...getHeaders(),
            'Prefer': 'resolution=merge-duplicates,return=minimal',
        };

        const resp = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(listingData),
        });

        if (!resp.ok) {
            const errText = await resp.text();
            console.error('[EtsyResearch] supabase: saveListing error', resp.status, errText);
        } else {
            console.log('[EtsyResearch] supabase: saveListing success for', listingData.listing_id);
        }
    } catch (e) {
        console.error('[EtsyResearch] supabase: saveListing exception', e);
    }
}

// ─── saveSearchSession ────────────────────────────────────────────────────

/**
 * Insert a search session record into Supabase.
 * @param {object} sessionData
 */
async function saveSearchSession(sessionData) {
    try {
        if (MODE === 'public' && EDGE_FUNCTION_URL) {
            await routedWrite(TABLES.SEARCH_SESSIONS, sessionData);
            console.log('[EtsyResearch] supabase: saveSearchSession routed to edge function.');
            return;
        }

        const url = `${SUPABASE_URL}/rest/v1/${TABLES.SEARCH_SESSIONS}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(sessionData),
        });

        if (!resp.ok) {
            const errText = await resp.text();
            console.error('[EtsyResearch] supabase: saveSearchSession error', resp.status, errText);
        } else {
            console.log('[EtsyResearch] supabase: saveSearchSession success for keyword:', sessionData.search_keyword);
        }
    } catch (e) {
        console.error('[EtsyResearch] supabase: saveSearchSession exception', e);
    }
}

// ─── getListingById ───────────────────────────────────────────────────────

/**
 * Fetch a single listing by listing_id.
 * @param {string} listingId
 * @returns {Promise<object|null>}
 */
async function getListingById(listingId) {
    try {
        const url = `${SUPABASE_URL}/rest/v1/${TABLES.LISTINGS}?listing_id=eq.${encodeURIComponent(listingId)}&limit=1`;
        const resp = await fetch(url, {
            method: 'GET',
            headers: {
                ...getHeaders(),
                'Prefer': 'return=representation',
            },
        });

        if (!resp.ok) {
            console.error('[EtsyResearch] supabase: getListingById error', resp.status);
            return null;
        }

        const rows = await resp.json();
        return rows.length > 0 ? rows[0] : null;
    } catch (e) {
        console.error('[EtsyResearch] supabase: getListingById exception', e);
        return null;
    }
}
