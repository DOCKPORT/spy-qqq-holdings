/**
 * @file Build one fund panel and filter its rows.
 */

/**
 * @typedef {object} FundRefs
 * @property {HTMLElement} root - The fund panel.
 * @property {HTMLElement} name - The fund name.
 * @property {HTMLElement} count - The holding count.
 * @property {HTMLElement} date - The holdings date.
 * @property {HTMLElement} source - The source label.
 * @property {HTMLElement} note - The source note.
 * @property {HTMLElement} scroll - The scroll region.
 * @property {HTMLElement} body - The table body.
 * @property {HTMLElement} empty - The no-match line.
 * @property {HTMLElement} error - The error line.
 */

/**
 * @typedef {object} Row
 * @property {HTMLTableRowElement} element - The table row.
 * @property {string} haystack - The lower-case symbol and name.
 */

/**
 * @typedef {object} FilterResult
 * @property {number} visible - The visible row count.
 * @property {number} total - The total row count.
 */

/**
 * @typedef {object} FundList
 * @property {number} total - The total row count.
 * @property {(query: string) => FilterResult} filter - Show the matching rows.
 */

/**
 * @typedef {object} ListNamespace
 * @property {(fund: Fund, refs: FundRefs, maxWeight: number) => FundList} [renderFund] - Draw one fund.
 * @property {(config: FundConfig, refs: FundRefs, error: unknown) => void} [renderFundError] - Report a failed fund.
 */

(() => {
  "use strict";

  /** @type {Window & { SPYQQQ?: ListNamespace }} */
  const page = window;
  const ns = page.SPYQQQ || (page.SPYQQQ = {});

  /** @type {Record<string, string>} */
  const SOURCE_LABELS = {
    issuer: "Issuer file",
    sec_nport: "SEC Form N-PORT",
  };

  /** @type {Record<string, string>} */
  const SOURCE_NOTES = {
    issuer: "The issuer file usually covers the prior trading day.",
    sec_nport: "Quarterly SEC filing. This portfolio can be months old.",
  };

  const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  /**
   * Format an ISO date without a time shift.
   * @param {string} value - The ISO date.
   * @returns {string} The display date.
   */
  const formatDate = (value) => {
    if (value === "") {
      return "unknown";
    }
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return DATE_FORMAT.format(date);
  };

  /**
   * Write a count with the correct noun.
   * @param {number} count - The row count.
   * @returns {string} The label.
   */
  const holdingLabel = (count) =>
    `${count} holding${count === 1 ? "" : "s"}`;

  /**
   * Build one row.
   * @param {Holding} holding - The holding.
   * @param {number} rank - The rank in the fund.
   * @param {number} maxWeight - The largest weight in both funds.
   * @returns {Row} The row and its search text.
   */
  const buildRow = (holding, rank, maxWeight) => {
    const row = document.createElement("tr");
    row.className = "holding-row";
    if (!(holding.weightPct > 0)) {
      row.classList.add("holding-row--zero");
    }

    const rankCell = document.createElement("td");
    rankCell.className = "col-rank";
    const rankText = document.createElement("span");
    rankText.className = "table__rank numeric";
    rankText.textContent = String(rank);
    rankCell.append(rankText);

    const assetCell = document.createElement("td");
    assetCell.className = "col-asset";
    const wrap = document.createElement("div");
    wrap.className = "holding";
    const symbol = document.createElement("span");
    symbol.className = "holding__sym";
    symbol.textContent = holding.symbol;
    const name = document.createElement("span");
    name.className = "holding__name";
    name.textContent = holding.name;
    wrap.append(symbol, name);
    assetCell.append(wrap);

    const weightCell = document.createElement("td");
    weightCell.className = "is-numeric";
    const weightWrap = document.createElement("div");
    weightWrap.className = "holding__weight";
    const bar = document.createElement("span");
    bar.className = "holding__bar";
    bar.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    fill.className = "holding__bar-fill";
    const share = maxWeight > 0 ? (holding.weightPct / maxWeight) * 100 : 0;
    fill.style.width = `${Math.max(0, Math.min(100, share)).toFixed(2)}%`;
    bar.append(fill);
    const percent = document.createElement("span");
    percent.className = "holding__pct numeric";
    percent.textContent = `${holding.weightPct.toFixed(2)}%`;
    weightWrap.append(bar, percent);
    weightCell.append(weightWrap);
    row.append(rankCell, assetCell, weightCell);

    return {
      element: row,
      haystack: `${holding.symbol} ${holding.name}`.toLowerCase(),
    };
  };

  /**
   * Draw one fund panel.
   * @param {Fund} fund - The fund.
   * @param {FundRefs} refs - The panel elements.
   * @param {number} maxWeight - The largest weight in both funds.
   * @returns {FundList} The list filter.
   */
  const renderFund = (fund, refs, maxWeight) => {
    const holdings = [...fund.holdings].sort(
      (a, b) => b.weightPct - a.weightPct,
    );

    refs.name.textContent = fund.name;
    refs.date.textContent = formatDate(fund.holdingsAsOf);
    refs.source.textContent =
      SOURCE_LABELS[fund.source] || fund.source || "Unknown source";
    refs.note.textContent = SOURCE_NOTES[fund.source] || "";
    refs.root.classList.remove("fund-panel--error");
    refs.error.hidden = true;
    refs.scroll.hidden = false;
    refs.empty.hidden = true;

    const fragment = document.createDocumentFragment();
    /** @type {Row[]} */
    const rows = holdings.map((holding, index) => {
      const row = buildRow(holding, index + 1, maxWeight);
      fragment.append(row.element);
      return row;
    });
    refs.body.replaceChildren(fragment);

    const total = rows.length;
    const setCount = (visible) => {
      refs.count.textContent =
        visible === total ? holdingLabel(total) : `${visible} of ${total}`;
    };
    setCount(total);

    return {
      total,
      filter(query) {
        const needle = query.trim().toLowerCase();
        let visible = 0;
        for (const row of rows) {
          const match = needle === "" || row.haystack.includes(needle);
          row.element.hidden = !match;
          if (match) {
            visible += 1;
          }
        }
        setCount(visible);
        refs.empty.hidden = visible !== 0;
        refs.scroll.scrollTop = 0;
        return { visible, total };
      },
    };
  };

  /**
   * Report a fund that did not load.
   * @param {FundConfig} config - The fund config.
   * @param {FundRefs} refs - The panel elements.
   * @param {unknown} error - The failure.
   * @returns {void}
   */
  const renderFundError = (config, refs, error) => {
    refs.root.classList.add("fund-panel--error");
    refs.name.textContent = config.ticker;
    refs.count.textContent = "\u2014";
    refs.date.textContent = "\u2014";
    refs.source.textContent = "Unavailable";
    refs.note.textContent = "";
    refs.body.replaceChildren();
    refs.empty.hidden = true;
    refs.error.hidden = false;
    refs.error.textContent = `${config.ticker} did not load. ${
      error instanceof Error ? error.message : String(error)
    }`;
  };

  ns.renderFund = renderFund;
  ns.renderFundError = renderFundError;
})();
