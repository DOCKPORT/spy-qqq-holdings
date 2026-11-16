/**
 * @file Build one fund panel and filter its rows.
 */

/**
 * @typedef {object} FundRefs
 * @property {HTMLElement} root - The fund panel.
 * @property {HTMLElement} name - The fund name.
 * @property {HTMLElement} count - The row count.
 * @property {HTMLElement} date - The holdings date.
 * @property {HTMLElement} source - The source label.
 * @property {HTMLElement} caption - The table caption.
 * @property {HTMLElement} scroll - The scroll region.
 * @property {HTMLButtonElement} toggle - The collapse button.
 * @property {HTMLElement} body - The table body.
 * @property {HTMLElement} empty - The no-match line.
 * @property {HTMLElement} error - The error line.
 */

/**
 * @typedef {object} PanelItem
 * @property {string} primary - The ticker or sector label.
 * @property {string} [secondary] - The company name for a stock row.
 * @property {number} weightPct - The weight in percent.
 * @property {string} searchText - The search text.
 */

/**
 * @typedef {"stocks" | "sectors"} ViewKind
 */

/**
 * @typedef {object} Row
 * @property {HTMLTableRowElement} element - The table row.
 * @property {string} haystack - The lower-case search text.
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
 * @property {(fund: Fund, refs: FundRefs, maxWeight: number) => FundList} [renderFund] - Draw one stock fund.
 * @property {(fund: SectorFund, refs: FundRefs, maxWeight: number) => FundList} [renderSectorFund] - Draw one sector fund.
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
   * @param {ViewKind} kind - The view kind.
   * @returns {string} The label.
   */
  const countLabel = (count, kind) => {
    const noun = kind === "sectors" ? "sector" : "holding";
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
  };

  /**
   * Build one row.
   * @param {PanelItem} item - The row data.
   * @param {number} rank - The rank in the fund.
   * @param {number} maxWeight - The largest weight in both funds.
   * @param {ViewKind} kind - The view kind.
   * @returns {Row} The row and its search text.
   */
  const buildRow = (item, rank, maxWeight, kind) => {
    const row = document.createElement("tr");
    row.className = "holding-row";
    if (kind === "sectors") {
      row.classList.add("holding-row--sector");
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

    if (item.secondary !== undefined) {
      const symbol = document.createElement("span");
      symbol.className = "holding__sym";
      symbol.textContent = item.primary;
      const name = document.createElement("span");
      name.className = "holding__name";
      name.textContent = item.secondary;
      wrap.append(symbol, name);
    } else {
      const name = document.createElement("span");
      name.className = "holding__name";
      name.textContent = item.primary;
      wrap.append(name);
    }
    assetCell.append(wrap);

    const weightCell = document.createElement("td");
    weightCell.className = "is-numeric";
    const weightWrap = document.createElement("div");
    weightWrap.className = "holding__weight";
    const bar = document.createElement("span");
    bar.className = "holding__bar";
    bar.setAttribute("aria-hidden", "true");
    bar.title = "Bars use a square-root scale.";
    const fill = document.createElement("span");
    fill.className = "holding__bar-fill";
    /* The square-root scale gives the small weights more range. */
    const ratio = maxWeight > 0 ? item.weightPct / maxWeight : 0;
    const share = Math.sqrt(Math.max(0, ratio)) * 100;
    fill.style.width = `${Math.min(100, share).toFixed(2)}%`;
    bar.append(fill);
    const percent = document.createElement("span");
    percent.className = "holding__pct numeric";
    const percentValue =
      item.weightPct < 0.01
        ? item.weightPct.toFixed(4)
        : item.weightPct.toFixed(2);
    percent.textContent = `${percentValue}%`;
    weightWrap.append(bar, percent);
    weightCell.append(weightWrap);
    row.append(rankCell, assetCell, weightCell);

    return {
      element: row,
      haystack: item.searchText.toLowerCase(),
    };
  };

  /**
   * Draw one panel.
   * @param {PanelItem[]} items - The row data.
   * @param {Fund | SectorFund} fund - The fund.
   * @param {FundRefs} refs - The panel elements.
   * @param {number} maxWeight - The largest weight in both funds.
   * @param {ViewKind} kind - The view kind.
   * @returns {FundList} The list filter.
   */
  const renderPanel = (items, fund, refs, maxWeight, kind) => {
    const rowsData = [...items]
      .filter((item) => item.weightPct !== 0)
      .sort((a, b) => b.weightPct - a.weightPct);

    refs.name.textContent = fund.name;
    refs.date.textContent = formatDate(fund.holdingsAsOf);
    refs.source.textContent =
      SOURCE_LABELS[fund.source] || fund.source || "Unknown source";
    refs.root.classList.remove("fund-panel--error");
    refs.error.hidden = true;
    refs.scroll.hidden = false;
    refs.empty.hidden = true;

    const fragment = document.createDocumentFragment();
    /** @type {Row[]} */
    const rows = rowsData.map((item, index) => {
      const row = buildRow(item, index + 1, maxWeight, kind);
      fragment.append(row.element);
      return row;
    });
    refs.body.replaceChildren(fragment);

    const total = rows.length;
    const setCount = (visible) => {
      refs.count.textContent =
        visible === total ? countLabel(total, kind) : `${visible} of ${total}`;
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
   * Draw one stock fund.
   * @param {Fund} fund - The fund.
   * @param {FundRefs} refs - The panel elements.
   * @param {number} maxWeight - The largest weight in both funds.
   * @returns {FundList} The list filter.
   */
  const renderFund = (fund, refs, maxWeight) => {
    const items = fund.holdings.map((holding) => ({
      primary: holding.symbol,
      secondary: holding.name,
      weightPct: holding.weightPct,
      searchText: `${holding.symbol} ${holding.name}`,
    }));
    return renderPanel(items, fund, refs, maxWeight, "stocks");
  };

  /**
   * Draw one sector fund.
   * @param {SectorFund} fund - The sector fund.
   * @param {FundRefs} refs - The panel elements.
   * @param {number} maxWeight - The largest sector weight in both funds.
   * @returns {FundList} The list filter.
   */
  const renderSectorFund = (fund, refs, maxWeight) => {
    const items = fund.sectors.map((sector) => ({
      primary: sector.label,
      weightPct: sector.weightPct,
      searchText: `${sector.label} ${sector.key}`,
    }));
    return renderPanel(items, fund, refs, maxWeight, "sectors");
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
    refs.body.replaceChildren();
    refs.empty.hidden = true;
    refs.error.hidden = false;
    refs.error.textContent = `${config.ticker} did not load. ${
      error instanceof Error ? error.message : String(error)
    }`;
  };

  ns.renderFund = renderFund;
  ns.renderSectorFund = renderSectorFund;
  ns.renderFundError = renderFundError;
})();
