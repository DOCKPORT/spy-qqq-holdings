/**
 * @file Read the two holdings snapshots.
 */

/**
 * @typedef {object} Holding
 * @property {string} symbol - The stock ticker.
 * @property {string} name - The company name, or the ticker when null.
 * @property {number} weightPct - The weight in percent.
 */

/**
 * @typedef {object} Fund
 * @property {string} ticker - "SPY" or "QQQ".
 * @property {string} name - The fund name.
 * @property {string} holdingsAsOf - The date of the holdings file.
 * @property {string} source - "issuer" or "sec_nport".
 * @property {string} pageUrl - The TickerInside page.
 * @property {string} cite - The credit line.
 * @property {Holding[]} holdings - The holding rows.
 */

/**
 * @typedef {object} FundConfig
 * @property {string} ticker - The fund ticker.
 * @property {string} url - The snapshot path.
 */

/**
 * @typedef {object} DataNamespace
 * @property {FundConfig[]} [funds] - The two snapshots.
 * @property {(config: FundConfig) => Promise<Fund>} [loadFund] - Read one snapshot.
 */

(() => {
  "use strict";

  /** @type {Window & { SPYQQQ?: DataNamespace }} */
  const page = window;
  const ns = page.SPYQQQ || (page.SPYQQQ = {});

  /** The two snapshots. */
  ns.funds = [
    { ticker: "SPY", url: "data/spy.json" },
    { ticker: "QQQ", url: "data/qqq.json" },
  ];

  /** The browser checks each file with the server before use. */
  const REVALIDATE = { cache: "no-cache" };

  /**
   * Check one raw holding row.
   * @param {unknown} row - One raw row.
   * @returns {row is Holding} True when the row holds a symbol and a weight.
   */
  const isHolding = (row) => {
    if (typeof row !== "object" || row === null) {
      return false;
    }
    const candidate = /** @type {Record<string, unknown>} */ (row);
    return (
      typeof candidate.symbol === "string" &&
      candidate.symbol.trim() !== "" &&
      typeof candidate.weightPct === "number" &&
      Number.isFinite(candidate.weightPct)
    );
  };

  /**
   * Read one fund snapshot.
   * @param {FundConfig} config - The fund ticker and path.
   * @returns {Promise<Fund>} The fund.
   */
  const loadFund = async (config) => {
    const response = await fetch(config.url, REVALIDATE);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${config.url}.`);
    }

    /** @type {unknown} */
    const payload = await response.json();
    if (typeof payload !== "object" || payload === null) {
      throw new Error(`${config.url} holds no object.`);
    }
    const raw = /** @type {Record<string, unknown>} */ (payload);
    if (typeof raw.name !== "string" || !Array.isArray(raw.holdings)) {
      throw new Error(`${config.url} holds no fund name or holdings list.`);
    }

    const holdings = raw.holdings.filter(isHolding).map((row) => ({
      symbol: row.symbol.trim(),
      name:
        typeof row.name === "string" && row.name.trim() !== ""
          ? row.name.trim()
          : row.symbol,
      weightPct: row.weightPct,
    }));
    if (holdings.length === 0) {
      throw new Error(`${config.url} holds no holding row.`);
    }

    return {
      ticker: config.ticker,
      name: raw.name,
      holdingsAsOf:
        typeof raw.holdingsAsOf === "string" ? raw.holdingsAsOf : "",
      source: typeof raw.source === "string" ? raw.source : "",
      pageUrl: typeof raw.pageUrl === "string" ? raw.pageUrl : "",
      cite: typeof raw.cite === "string" ? raw.cite : "",
      holdings,
    };
  };

  ns.loadFund = loadFund;
})();
