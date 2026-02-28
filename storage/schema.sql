-- =============================================================
-- Etsy Research Tool — Supabase Schema
-- =============================================================
-- Run this SQL in your Supabase SQL Editor to set up the tables.
--
-- SECURITY NOTE (Personal Mode):
--   The RLS policies below allow all operations via the anon key.
--   This is safe for single-user personal use where you control
--   who has the anon key.
--
-- FOR PUBLIC RELEASE:
--   1. Remove the permissive policies below.
--   2. Add user-scoped RLS using auth.uid(), e.g.:
--        CREATE POLICY "User can only access own data" ON listings
--          FOR ALL USING (user_id = auth.uid());
--   3. Route all writes through a Supabase Edge Function that:
--        - Validates and sanitizes input
--        - Applies rate limits per user/IP
--        - Uses the service_role key server-side only
--   4. NEVER expose the service_role key in the extension build.
-- =============================================================


-- -------------------------------------------------------
-- Table: listings
-- Stores scraped and estimated data for individual Etsy listings.
-- -------------------------------------------------------
create table if not exists listings (
  id                       uuid        primary key default gen_random_uuid(),
  listing_id               text        unique not null,
  shop_name                text,
  shop_url                 text,
  shop_age_years           numeric,
  shop_age_display         text,           -- human readable e.g. "3.5 yrs" or "8 months"
  shop_created_year        integer,
  total_shop_sales         integer,
  total_shop_listings      integer,
  total_shop_reviews       integer,
  estimated_listing_sales  integer,
  estimated_sales_low      integer,
  estimated_sales_high     integer,
  listing_favorites        integer,
  listing_reviews          integer,
  listing_price            numeric,
  listing_currency         text,
  listing_age_days         integer,
  listing_age_display      text,           -- human readable e.g. "4 months" or "2.5 yrs"
  listing_publish_date     date,
  category                 text,
  subcategory              text,
  is_bestseller            boolean     default false,
  is_popular_now           boolean     default false,
  confidence_score         integer,        -- 0 to 100
  confidence_reason        text,           -- e.g. "Low sample size" or "Full data available"
  sample_listings_used     integer,
  analyzed_at              timestamptz default now()
);


-- -------------------------------------------------------
-- Table: search_sessions
-- Stores one record per Etsy search results page visit.
-- -------------------------------------------------------
create table if not exists search_sessions (
  id                        uuid        primary key default gen_random_uuid(),
  search_keyword            text        not null,   -- cleaned e.g. "minimalist ring"
  search_keyword_raw        text,                   -- raw URL param e.g. "minimalist+ring"
  total_results_displayed   integer,                -- how many listings shown on that page
  page_number               integer     default 1,
  listing_ids_found         jsonb,                  -- JSON array of listing IDs visible
  top_listing_id            text,                   -- first listing ID in results
  search_url                text,
  searched_at               timestamptz default now()
);


-- -------------------------------------------------------
-- Row Level Security
-- -------------------------------------------------------

-- Enable RLS on both tables
alter table listings         enable row level security;
alter table search_sessions  enable row level security;

-- Personal-use permissive policies (allow all operations via anon key)
-- REMOVE THESE FOR PUBLIC RELEASE — see note at top of file
create policy "Allow all for personal use"
  on listings
  for all
  using (true)
  with check (true);

create policy "Allow all for personal use"
  on search_sessions
  for all
  using (true)
  with check (true);
