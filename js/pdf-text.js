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

  // pdf.js yields drawing operations, which do not always follow reading
  // order. A large number of upward jumps is a signal to inspect the
  // extracted text, not proof that a particular column is wrong.
  function inspectPage(items, pageNumber) {
    const text = extractTextItems(items);
    const wordCount = (text.match(/[\p{L}\p{N}]+/gu) || []).length;
    const positioned = (items || []).filter((item) => Array.isArray(item.transform) &&
      Number.isFinite(item.transform[5]) && String(item.str || "").trim());
    let upwardJumps = 0;
    for (let i = 1; i < positioned.length; i++) {
      if (positioned[i].transform[5] - positioned[i - 1].transform[5] > 12) upwardJumps++;
    }
    return {
      page: pageNumber,
      text,
      wordCount,
      suspectedReadingOrder: positioned.length >= 40 && upwardJumps >= 8 && upwardJumps / positioned.length > 0.08,
    };
  }

  function summarizePages(pages) {
    const valid = pages || [];
    return {
      pageCount: valid.length,
      sparsePages: valid.filter((page) => page.wordCount < 12).map((page) => page.page),
      orderPages: valid.filter((page) => page.suspectedReadingOrder).map((page) => page.page),
      totalWords: valid.reduce((count, page) => count + page.wordCount, 0),
    };
  }

  return { extractTextItems, inspectPage, summarizePages };
});
