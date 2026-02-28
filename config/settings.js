// config/settings.js
// Central configuration for the Etsy Research Tool extension.

const CONFIG = {
  SUPABASE_URL: 'https://dromarkfkrfurvpggkcc.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyb21hcmtma3JmdXJ2cGdna2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5ODM0MTYsImV4cCI6MjA4NzU1OTQxNn0.9hVvg_szNzhLBmUu3mKWxvkf_HwXByu6Z_Q-_nHDZok',

  // For public release, set MODE to 'public' and provide EDGE_FUNCTION_URL.
  // In 'public' mode, all writes are routed through the Edge Function instead
  // of directly to Supabase, preventing anon key abuse.
  MODE: 'public', // 'personal' | 'public'
  EDGE_FUNCTION_URL: 'https://dromarkfkrfurvpggkcc.supabase.co/functions/v1/clever-processor', // used when MODE === 'public'

  TABLES: {
    LISTINGS: 'listings',
    SEARCH_SESSIONS: 'search_sessions',
  },

  // How long shop data is cached in chrome.storage.local (6 hours)
  CACHE_DURATION_MS: 1000 * 60 * 60 * 6,

  // Human-like delay (ms) before scraping the background shop tab
  SHOP_SCRAPE_DELAY_MS: 1500,

  // Maximum number of shop pages to sample for listings
  MAX_SHOP_PAGES_TO_SAMPLE: 3,

  DEFAULT_THEME: 'default', // 'default' | 'dark' | 'minimal' | 'bold'

  DEFAULT_VISIBLE_METRICS: {
    shopAge: true,
    shopSales: true,
    totalListings: true,
    estListingSales: true,
    confidenceScore: true,
    listingAge: true,
    listingReviews: true,
    listingFavorites: true,
  },

  // Set to false to silence debug logs in production
  DEBUG: true,
};
