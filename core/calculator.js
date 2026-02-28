// core/calculator.js
// Pure math functions for the sales estimation model.
// No DOM access, no network calls — only computation.

/**
 * Compute the mean of an array of numbers, ignoring nulls.
 * @param {number[]} values
 * @returns {number}
 */
function mean(values) {
    const valid = values.filter(v => v != null && !isNaN(v));
    if (valid.length === 0) return 0;
    return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

/**
 * Parse a date string to number of days from that date to today.
 * @param {string|null} dateStr
 * @returns {number|null}
 */
function dateToDays(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    return Math.max(0, Math.floor((today - d) / (1000 * 60 * 60 * 24)));
}

/**
 * Compute shop-level averages from an array of sample listings.
 * @param {Array<{favorites, reviews, price, publish_date}>} sampleListings
 * @returns {{ avgFavorites, avgReviews, avgPrice, avgAgeDays }}
 */
function calcShopAverages(sampleListings) {
    if (!sampleListings || sampleListings.length === 0) {
        return { avgFavorites: 0, avgReviews: 0, avgPrice: 0, avgAgeDays: 0 };
    }

    const avgFavorites = mean(sampleListings.map(l => l.favorites));
    const avgReviews = mean(sampleListings.map(l => l.reviews));
    const avgPrice = mean(sampleListings.map(l => l.price));
    const avgAgeDays = mean(sampleListings.map(l => dateToDays(l.publish_date)));

    return { avgFavorites, avgReviews, avgPrice, avgAgeDays };
}

/**
 * Compute a relative weight score for a single listing vs shop averages.
 * @param {{ favorites, reviews, ageDays, is_bestseller }} listing
 * @param {{ avgFavorites, avgReviews, avgAgeDays }} shopAverages
 * @returns {number} weight
 */
function calcListingWeight(listing, shopAverages) {
    const { avgFavorites, avgReviews, avgAgeDays } = shopAverages;

    const favorites_ratio = avgFavorites > 0
        ? Math.min((listing.favorites || 0) / avgFavorites, 5)
        : 0;

    const reviews_ratio = avgReviews > 0
        ? Math.min((listing.reviews || 0) / avgReviews, 5)
        : 0;

    const ageDays = listing.ageDays != null
        ? listing.ageDays
        : dateToDays(listing.publish_date) || 0;

    const age_ratio = avgAgeDays > 0
        ? Math.min(ageDays / avgAgeDays, 3)
        : 0;

    const bestseller_boost = listing.is_bestseller ? 1.5 : 1.0;

    const weight = ((favorites_ratio + reviews_ratio + age_ratio) / 3) * bestseller_boost;
    return weight;
}

/**
 * Compute the sum of weights across all sample listings.
 * @param {Array} sampleListings
 * @param {{ avgFavorites, avgReviews, avgAgeDays }} shopAverages
 * @returns {number}
 */
function calcSumOfWeights(sampleListings, shopAverages) {
    return sampleListings.reduce((sum, listing) => {
        const ageDays = dateToDays(listing.publish_date);
        return sum + calcListingWeight({ ...listing, ageDays }, shopAverages);
    }, 0);
}
