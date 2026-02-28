// core/estimator.js
// Main estimation engine. Combines listing data + shop data into a full estimate.
// Depends on: core/calculator.js (must be loaded first), utils/age-formatter.js

/**
 * Compute a confidence score (0–100) based on data completeness.
 * @param {object} listingData
 * @param {object} shopData
 * @returns {{ score: number, reason: string }}
 */
function computeConfidence(listingData, shopData) {
    // No base truth — zero confidence
    if (shopData.total_shop_sales == null) {
        return { score: 0, reason: 'Low confidence — limited sample size' };
    }

    let score = 100;
    const sampleCount = (shopData.sample_listings || []).length;

    if (sampleCount < 5) score -= 40;
    if (sampleCount < 10) score -= 20; // cumulative

    if (listingData.listing_favorites == null) score -= 15;
    if (listingData.listing_reviews == null) score -= 15;
    if (listingData.listing_publish_date == null) score -= 10;

    score = Math.max(0, Math.min(100, score));

    let reason;
    if (score >= 80) {
        reason = 'High confidence — full data available';
    } else if (score >= 50) {
        reason = 'Medium confidence — partial data';
    } else {
        reason = 'Low confidence — limited sample size';
    }

    return { score, reason };
}

/**
 * Main estimation function.
 * @param {object} listingData  — from listing-scraper
 * @param {object} shopData     — from shop-scraper
 * @returns {object} Full estimation result
 */
function estimateListing(listingData, shopData) {
    const sampleListings = shopData.sample_listings || [];

    // Step 1: Shop averages
    const shopAverages = calcShopAverages(sampleListings);

    // Step 2: Target listing age in days
    const listingAgeDays = (() => {
        if (listingData.listing_publish_date) {
            const d = new Date(listingData.listing_publish_date);
            if (!isNaN(d.getTime())) {
                return Math.max(0, Math.floor((new Date() - d) / (1000 * 60 * 60 * 24)));
            }
        }
        return null;
    })();

    // Step 3: Weight for target listing
    const targetForWeight = {
        favorites: listingData.listing_favorites,
        reviews: listingData.listing_reviews,
        ageDays: listingAgeDays,
        is_bestseller: listingData.is_bestseller || false,
    };
    const targetWeight = calcListingWeight(targetForWeight, shopAverages);

    // Step 4: Sum of all weights (samples + target)
    const sumOfSampleWeights = calcSumOfWeights(sampleListings, shopAverages);
    const sumOfAllWeights = sumOfSampleWeights + targetWeight;

    // Step 5: Estimated sales
    let estimated_listing_sales = null;
    let estimated_sales_low = null;
    let estimated_sales_high = null;

    if (shopData.total_shop_sales != null && sumOfAllWeights > 0) {
        const listing_share = targetWeight / sumOfAllWeights;
        estimated_listing_sales = Math.round(shopData.total_shop_sales * listing_share);
        estimated_sales_low = Math.round(estimated_listing_sales * 0.75);
        estimated_sales_high = Math.round(estimated_listing_sales * 1.35);
    }

    // Step 6: Confidence
    const { score: confidence_score, reason: confidence_reason } = computeConfidence(listingData, shopData);

    // Step 7: Age displays
    const shop_age_display = shopData.shop_created_year
        ? shopYearToAge(shopData.shop_created_year)
        : 'Unknown';

    const listing_age_display = listingData.listing_publish_date
        ? publishDateToAge(listingData.listing_publish_date)
        : 'Unknown';

    return {
        estimated_listing_sales,
        estimated_sales_low,
        estimated_sales_high,
        confidence_score,
        confidence_reason,
        sample_listings_used: sampleListings.length,
        shop_age_display,
        listing_age_display,
        listing_age_days: listingAgeDays,
    };
}
