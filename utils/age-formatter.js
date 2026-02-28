// utils/age-formatter.js
// Shared utility for formatting age (shop age, listing age) into human-readable strings.

/**
 * Formats a number of days into a human-readable age string.
 * @param {number} days - Number of days
 * @returns {string} e.g. "9 days", "3 weeks", "4.5 months", "3.5 yrs"
 */
function formatAge(days) {
    if (days == null || isNaN(days) || days < 0) return 'Unknown';

    if (days < 14) {
        return `${Math.round(days)} days`;
    }

    if (days < 60) {
        const weeks = Math.round(days / 7);
        return `${weeks} week${weeks !== 1 ? 's' : ''}`;
    }

    if (days < 730) {
        const months = parseFloat((days / 30.44).toFixed(1));
        // Remove trailing .0
        const display = Number.isInteger(months) ? months : months;
        return `${display} month${display !== 1 ? 's' : ''}`;
    }

    // 730+ days
    const years = parseFloat((days / 365.25).toFixed(1));
    return `${years} yr${years !== 1 ? 's' : ''}`;
}

/**
 * Converts an Etsy "On Etsy since YEAR" integer to a human-readable age string.
 * Calculates from Jan 1 of that year to today.
 * @param {number} year - e.g. 2018
 * @returns {string} e.g. "3.5 yrs"
 */
function shopYearToAge(year) {
    if (!year || isNaN(year)) return 'Unknown';
    const startDate = new Date(`${year}-01-01`);
    const today = new Date();
    const diffMs = today - startDate;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return formatAge(days);
}

/**
 * Parses a listing publish date string and returns a human-readable age string.
 * @param {string} dateString - A parseable date string e.g. "Oct 12, 2021" or ISO
 * @returns {string} e.g. "4 months"
 */
function publishDateToAge(dateString) {
    if (!dateString) return 'Unknown';
    const publishDate = new Date(dateString);
    if (isNaN(publishDate.getTime())) return 'Unknown';
    const today = new Date();
    const diffMs = today - publishDate;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return formatAge(days);
}
