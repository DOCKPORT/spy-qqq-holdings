/**
 * @file Page bootstrap. Read both funds, draw the panels, and wire the search.
 */

/**
 * @typedef {object} AppNamespace
 * @property {FundConfig[]} [funds] - The two snapshots.
 * @property {(config: FundConfig) => Promise<Fund>} [loadFund] - Read one snapshot.
 * @property {(fund: Fund, refs: FundRefs, maxWeight: number) => FundList} [renderFund] - Draw one fund.
 * @property {(config: FundConfig, refs: FundRefs, error: unknown) => void} [renderFundError] - Report a failed fund.
 */

/**
 * @typedef {"loading" | "ready" | "error"} AppState
 */

(() => {
  "use strict";

  /** @type {Window & { SPYQQQ?: AppNamespace }} */
  const page = window;

  /**
   * Write the app state onto the document root.
   * @param {AppState} state - The next app state.
   * @returns {void}
   */
  const setAppState = (state) => {
    document.documentElement.dataset.appState = state;
  };

  /**
   * Find a required element by id.
   * @param {string} id - The element id.
   * @returns {HTMLElement} The element.
   */
  const requireElement = (id) => {
    const node = document.getElementById(id);
    if (!(node instanceof HTMLElement)) {
      throw new Error(`Missing element #${id}.`);
    }
    return node;
  };

  /**
   * Find a required search input by id.
   * @param {string} id - The input id.
   * @returns {HTMLInputElement} The input.
   */
  const requireInput = (id) => {
    const node = document.getElementById(id);
    if (!(node instanceof HTMLInputElement)) {
      throw new Error(`Missing input #${id}.`);
    }
    return node;
  };

  /**
   * Collect the panel elements.
   * @returns {Record<string, FundRefs>} The panel elements by ticker.
   */
  const panelRefs = () => ({
    SPY: {
      root: requireElement("spy-panel"),
      name: requireElement("spy-name"),
      count: requireElement("spy-count"),
      date: requireElement("spy-date"),
      source: requireElement("spy-source"),
      note: requireElement("spy-note"),
      scroll: requireElement("spy-scroll"),
      body: requireElement("spy-rows"),
      empty: requireElement("spy-empty"),
      error: requireElement("spy-error"),
    },
    QQQ: {
      root: requireElement("qqq-panel"),
      name: requireElement("qqq-name"),
      count: requireElement("qqq-count"),
      date: requireElement("qqq-date"),
      source: requireElement("qqq-source"),
      note: requireElement("qqq-note"),
      scroll: requireElement("qqq-scroll"),
      body: requireElement("qqq-rows"),
      empty: requireElement("qqq-empty"),
      error: requireElement("qqq-error"),
    },
  });

  /**
   * Write the current year into the footer.
   * @returns {void}
   */
  const stampYear = () => {
    const slot = document.getElementById("footer-year");
    if (slot instanceof HTMLElement) {
      slot.textContent = `\u00A9 ${new Date().getFullYear()}`;
    }
  };

  /**
   * Point one footer credit link at the TickerInside page.
   * @param {Fund} fund - The fund.
   * @returns {void}
   */
  const setCredit = (fund) => {
    const link = document.getElementById(`${fund.ticker.toLowerCase()}-credit`);
    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }
    if (fund.pageUrl !== "") {
      link.href = fund.pageUrl;
    }
    if (fund.cite !== "") {
      link.title = fund.cite;
    }
    link.textContent = `${fund.ticker} source`;
  };

  /**
   * Load the data and start the page.
   * @returns {Promise<void>} A promise that settles after the first draw.
   */
  const init = async () => {
    stampYear();

    const ns = page.SPYQQQ;
    if (
      !ns ||
      !Array.isArray(ns.funds) ||
      typeof ns.loadFund !== "function" ||
      typeof ns.renderFund !== "function" ||
      typeof ns.renderFundError !== "function"
    ) {
      throw new Error("The page modules did not load.");
    }

    const loadFund = ns.loadFund;
    const renderFund = ns.renderFund;
    const renderFundError = ns.renderFundError;
    const configs = ns.funds;
    const refs = panelRefs();
    const input = requireInput("holdings-search");
    const status = requireElement("holdings-status");

    const results = await Promise.allSettled(
      configs.map((config) => loadFund(config)),
    );

    /** @type {Fund[]} */
    const loaded = [];
    /** @type {string[]} */
    const failed = [];

    results.forEach((result, index) => {
      const config = configs[index];
      if (result.status === "fulfilled") {
        loaded.push(result.value);
        return;
      }
      failed.push(config.ticker);
      renderFundError(config, refs[config.ticker], result.reason);
    });

    let maxWeight = 0;
    for (const fund of loaded) {
      for (const holding of fund.holdings) {
        maxWeight = Math.max(maxWeight, holding.weightPct);
      }
    }

    /** @type {Map<string, FundList>} */
    const lists = new Map();
    for (const fund of loaded) {
      lists.set(fund.ticker, renderFund(fund, refs[fund.ticker], maxWeight));
      setCredit(fund);
    }

    let frame = 0;
    const applyFilter = () => {
      const query = input.value.trim();
      let visible = 0;
      let total = 0;
      for (const list of lists.values()) {
        const result = list.filter(query);
        visible += result.visible;
        total += result.total;
      }

      if (total === 0) {
        status.textContent = "The holdings did not load. Run the fetch script.";
        return;
      }

      if (query !== "") {
        status.textContent = `${visible} of ${total} holdings match ${query}.`;
        return;
      }

      status.textContent = `${total} holdings across ${lists.size} ${
        lists.size === 1 ? "fund" : "funds"
      }.`;
    };

    input.addEventListener("input", () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(applyFilter);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || input.value === "") {
        return;
      }
      input.value = "";
      applyFilter();
    });

    applyFilter();

    if (failed.length > 0) {
      if (loaded.length === 0) {
        status.textContent = "The holdings did not load. Run the fetch script.";
      } else {
        const loadedTotal = [...lists.values()].reduce(
          (sum, list) => sum + list.total,
          0,
        );
        status.textContent = `${loadedTotal} holdings loaded. ${failed.join(
          " and ",
        )} did not load.`;
      }
    }

    setAppState(loaded.length > 0 ? "ready" : "error");
  };

  init().catch((error) => {
    console.error(error);
    setAppState("error");
    const status = document.getElementById("holdings-status");
    if (status instanceof HTMLElement) {
      status.textContent =
        error instanceof Error ? error.message : String(error);
    }
  });
})();
