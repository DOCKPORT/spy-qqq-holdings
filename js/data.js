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
 * @typedef {object} Sector
 * @property {string} key - The sector key.
 * @property {string} label - The display label.
 * @property {number} weightPct - The weight in percent.
 */

/**
 * @typedef {object} SectorFund
 * @property {string} ticker - "SPY" or "QQQ".
 * @property {string} name - The fund name.
 * @property {string} holdingsAsOf - The date of the holdings file.
 * @property {string} source - "issuer" or "sec_nport".
 * @property {number | null} sectorCoveragePct - The share of the fund with a sector.
 * @property {number | null} noSectorPct - The share with no sector.
 * @property {number | null} weightSumPct - The sum of the sector weights.
 * @property {Sector[]} sectors - The sector rows.
 */

/**
 * @typedef {object} FundConfig
 * @property {string} ticker - The fund ticker.
 * @property {string} url - The snapshot path.
 */

/**
 * @typedef {object} DataNamespace
 * @property {FundConfig[]} [funds] - The two holdings snapshots.
 * @property {FundConfig[]} [sectorFunds] - The two sector snapshots.
 * @property {(config: FundConfig) => Promise<Fund>} [loadFund] - Read one holdings snapshot.
 * @property {(config: FundConfig) => Promise<SectorFund>} [loadSectorFund] - Read one sector snapshot.
 */

(() => {
  "use strict";

  /** @type {Window & { SPYQQQ?: DataNamespace }} */
  const page = window;
  const ns = page.SPYQQQ || (page.SPYQQQ = {});

  /** The two holdings snapshots. */
  ns.funds = [
    { ticker: "SPY", url: "data/spy.json" },
    { ticker: "QQQ", url: "data/qqq.json" },
  ];

  /** The two sector snapshots. */
  ns.sectorFunds = [
    { ticker: "SPY", url: "data/spy_sector.json" },
    { ticker: "QQQ", url: "data/qqq_sector.json" },
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
   * Check one raw sector row.
   * @param {unknown} row - One raw row.
   * @returns {row is Sector} True when the row holds a key and a weight.
   */
  const isSector = (row) => {
    if (typeof row !== "object" || row === null) {
      return false;
    }
    const candidate = /** @type {Record<string, unknown>} */ (row);
    return (
      typeof candidate.key === "string" &&
      candidate.key.trim() !== "" &&
      typeof candidate.weightPct === "number" &&
      Number.isFinite(candidate.weightPct)
    );
  };

  /**
   * Read one JSON object from a URL.
   * @param {string} url - The file path.
   * @returns {Promise<Record<string, unknown>>} The object.
   */
  const readJson = async (url) => {
    const response = await fetch(url, REVALIDATE);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}.`);
    }

    /** @type {unknown} */
    const payload = await response.json();
    if (typeof payload !== "object" || payload === null) {
      throw new Error(`${url} holds no object.`);
    }
    return /** @type {Record<string, unknown>} */ (payload);
  };

  /**
   * Read one fund snapshot.
   * @param {FundConfig} config - The fund ticker and path.
   * @returns {Promise<Fund>} The fund.
   */
  const loadFund = async (config) => {
    const raw = await readJson(config.url);
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

  /**
   * Read one sector snapshot.
   * @param {FundConfig} config - The fund ticker and path.
   * @returns {Promise<SectorFund>} The sector fund.
   */
  const loadSectorFund = async (config) => {
    const raw = await readJson(config.url);
    if (typeof raw.name !== "string" || !Array.isArray(raw.sectors)) {
      throw new Error(`${config.url} holds no fund name or sector list.`);
    }

    const sectors = raw.sectors.filter(isSector).map((row) => ({
      key: row.key.trim(),
      label:
        typeof row.label === "string" && row.label.trim() !== ""
          ? row.label.trim()
          : row.key,
      weightPct: row.weightPct,
    }));
    if (sectors.length === 0) {
      throw new Error(`${config.url} holds no sector row.`);
    }

    return {
      ticker: config.ticker,
      name: raw.name,
      holdingsAsOf:
        typeof raw.holdingsAsOf === "string" ? raw.holdingsAsOf : "",
      source: typeof raw.source === "string" ? raw.source : "",
      sectorCoveragePct:
        typeof raw.sectorCoveragePct === "number"
          ? raw.sectorCoveragePct
          : null,
      noSectorPct:
        typeof raw.noSectorPct === "number" ? raw.noSectorPct : null,
      weightSumPct:
        typeof raw.weightSumPct === "number" ? raw.weightSumPct : null,
      sectors,
    };
  };

  ns.loadSectorFund = loadSectorFund;
})();
