/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/** Limit a linear surface cut by its actual Z velocity, in either direction.
 * Inputs are machine-coordinate deltas and rates in mm/min. Entries, rapids,
 * arcs and rotary moves must use their existing conservative handling.
 */
export function contourFeed(feed, zLimit, dx, dy, dz) {
    if (!(Number.isFinite(feed) && feed > 0)) {
        throw new Error('Contour requires a positive, finite cutting feed rate');
    }
    if (!(Number.isFinite(zLimit) && zLimit > 0)) {
        throw new Error('Contour requires a positive, finite global Z / plunge speed limit');
    }
    if (![dx, dy, dz].every(Number.isFinite)) {
        throw new Error('Contour contains an invalid surface move');
    }
    const distance = Math.hypot(dx, dy, dz);
    if (!distance) return Math.min(feed, zLimit);
    if (!dz) return feed;
    return Math.min(feed, zLimit * (distance / Math.abs(dz)));
}
