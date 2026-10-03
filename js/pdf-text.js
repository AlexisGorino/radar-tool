// Preserve pdf.js line boundaries and the spaces actually present in a PDF.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RadarPdfText = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function extractTextItems(items) {
    return (items || []).map((item) =>
      (typeof item.str === "string" ? item.str : "") + (item.hasEOL ? "\n" : "")
    ).join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  }

  return { extractTextItems };
});
