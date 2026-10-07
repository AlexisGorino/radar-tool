// Aggregate search outcomes locally. Never persist a query, JD, or candidate data.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RadarOutcome = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const KEY = "radar-outcomes-v1";
  const CATEGORIES = ["relevant", "noisy", "empty"];

  function read(storage) {
    try {
      const value = JSON.parse(storage.getItem(KEY) || "{}");
      if (!value || typeof value !== "object" || Array.isArray(value)) return {};
      const clean = {};
      Object.keys(value).forEach((network) => {
        if (!value[network] || typeof value[network] !== "object") return;
        const counts = {};
        CATEGORIES.forEach((category) => {
          const count = Number(value[network][category]);
          counts[category] = Number.isSafeInteger(count) && count > 0 ? count : 0;
        });
        clean[network] = counts;
      });
      return clean;
    } catch (error) {
      return {};
    }
  }

  function record(storage, network, category) {
    if (!storage || !network || !CATEGORIES.includes(category)) return false;
    try {
      const outcomes = read(storage);
      if (!outcomes[network]) outcomes[network] = { relevant: 0, noisy: 0, empty: 0 };
      outcomes[network][category] += 1;
      storage.setItem(KEY, JSON.stringify(outcomes));
      return true;
    } catch (error) {
      return false;
    }
  }

  function total(counts) {
    return CATEGORIES.reduce((sum, category) => sum + (counts[category] || 0), 0);
  }

  return { KEY, CATEGORIES, read, record, total };
});
