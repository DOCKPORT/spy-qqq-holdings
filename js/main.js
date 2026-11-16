/**
 * @file Page bootstrap. Read both views, draw the panels, and wire the search.
 */

/**
 * @typedef {object} AppNamespace
 * @property {FundConfig[]} [funds] - The two holdings snapshots.
 * @property {FundConfig[]} [sectorFunds] - The two sector snapshots.
 * @property {(config: FundConfig) => Promise<Fund>} [loadFund] - Read one holdings snapshot.
 * @property {(config: FundConfig) => Promise<SectorFund>} [loadSectorFund] - Read one sector snapshot.
 * @property {(fund: Fund, refs: FundRefs, maxWeight: number) => FundList} [renderFund] - Draw one stock fund.
 * @property {(fund: SectorFund, refs: FundRefs, maxWeight: number) => FundList} [renderSectorFund] - Draw one sector fund.
 * @property {(config: FundConfig, refs: FundRefs, error: unknown) => void} [renderFundError] - Report a failed fund.
 * @property {string} [version] - The release version.
 */

/**
 * @typedef {"stocks" | "sectors"} ViewKind
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
   * Find a required button by id.
   * @param {string} id - The button id.
   * @returns {HTMLButtonElement} The button.
   */
  const requireButton = (id) => {
    const node = document.getElementById(id);
    if (!(node instanceof HTMLButtonElement)) {
      throw new Error(`Missing button #${id}.`);
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
      caption: requireElement("spy-caption"),
      toggle: requireButton("spy-toggle"),
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
      caption: requireElement("qqq-caption"),
      toggle: requireButton("qqq-toggle"),
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
   * Write the release version into the footer brand slot.
   * @returns {void}
   */
  const stampVersion = () => {
    const slot = document.getElementById("footer-brand");
    const ns = page.SPYQQQ;
    const version = ns ? ns.version : undefined;
    if (
      slot instanceof HTMLElement &&
      typeof version === "string" &&
      version !== ""
    ) {
      slot.textContent = `SPY-QQQ Holdings ${version}`;
    }
  };

  /**
   * Load the data and start the page.
   * @returns {Promise<void>} A promise that settles after the first draw.
   */
  const init = async () => {
    stampYear();
    stampVersion();

    const ns = page.SPYQQQ;
    if (
      !ns ||
      !Array.isArray(ns.funds) ||
      !Array.isArray(ns.sectorFunds) ||
      typeof ns.loadFund !== "function" ||
      typeof ns.loadSectorFund !== "function" ||
      typeof ns.renderFund !== "function" ||
      typeof ns.renderSectorFund !== "function" ||
      typeof ns.renderFundError !== "function"
    ) {
      throw new Error("The page modules did not load.");
    }

    const loadFund = ns.loadFund;
    const loadSectorFund = ns.loadSectorFund;
    const renderFund = ns.renderFund;
    const renderSectorFund = ns.renderSectorFund;
    const renderFundError = ns.renderFundError;
    const stockConfigs = ns.funds;
    const sectorConfigs = ns.sectorFunds;
    const refs = panelRefs();
    const input = requireInput("holdings-search");
    const status = requireElement("holdings-status");

    const [stockResults, sectorResults] = await Promise.all([
      Promise.allSettled(stockConfigs.map((config) => loadFund(config))),
      Promise.allSettled(sectorConfigs.map((config) => loadSectorFund(config))),
    ]);

    /** @type {Map<string, Fund>} */
    const stockFunds = new Map();
    /** @type {Map<string, unknown>} */
    const stockFailures = new Map();
    /** @type {Map<string, SectorFund>} */
    const sectorFunds = new Map();
    /** @type {Map<string, unknown>} */
    const sectorFailures = new Map();

    /**
     * Fill the fund maps.
     * @template T
     * @param {FundConfig[]} configs - The view configs.
     * @param {PromiseSettledResult<T>[]} results - The load results.
     * @param {Map<string, T>} funds - The loaded funds.
     * @param {Map<string, unknown>} failures - The failures.
     * @returns {void}
     */
    const fillMaps = (configs, results, funds, failures) => {
      results.forEach((result, index) => {
        const config = configs[index];
        if (result.status === "fulfilled") {
          funds.set(config.ticker, result.value);
        } else {
          failures.set(config.ticker, result.reason);
        }
      });
    };

    fillMaps(stockConfigs, stockResults, stockFunds, stockFailures);
    fillMaps(sectorConfigs, sectorResults, sectorFunds, sectorFailures);

    /**
     * Draw the panels for one view.
     * @template T
     * @param {FundConfig[]} configs - The view configs.
     * @param {Map<string, T>} funds - The loaded funds.
     * @param {Map<string, unknown>} failures - The failures.
     * @param {(fund: T, refs: FundRefs, maxWeight: number) => FundList} render - The row renderer.
     * @param {ViewKind} kind - The view kind.
     * @param {number} maxWeight - The largest weight in the view.
     * @returns {Map<string, FundList>} The active lists.
     */
    const populate = (configs, funds, failures, render, kind, maxWeight) => {
      /** @type {Map<string, FundList>} */
      const lists = new Map();
      for (const config of configs) {
        const panel = refs[config.ticker];
        panel.caption.textContent = `${config.ticker} ${
          kind === "sectors" ? "sectors" : "holdings"
        } and weights`;
        const fund = funds.get(config.ticker);
        if (fund) {
          panel.toggle.hidden = false;
          lists.set(config.ticker, render(fund, panel, maxWeight));
        } else {
          panel.toggle.hidden = true;
          renderFundError(
            config,
            panel,
            failures.get(config.ticker) ?? new Error("No data."),
          );
        }
      }
      return lists;
    };

    /**
     * Draw the stock view.
     * @returns {Map<string, FundList>} The active lists.
     */
    const renderStockView = () => {
      let maxWeight = 0;
      for (const fund of stockFunds.values()) {
        for (const holding of fund.holdings) {
          maxWeight = Math.max(maxWeight, holding.weightPct);
        }
      }
      document.querySelectorAll(".table__asset-head").forEach((node) => {
        if (node instanceof HTMLElement) {
          node.textContent = "Holding";
        }
      });
      return populate(
        stockConfigs,
        stockFunds,
        stockFailures,
        renderFund,
        "stocks",
        maxWeight,
      );
    };

    /**
     * Draw the sector view.
     * @returns {Map<string, FundList>} The active lists.
     */
    const renderSectorView = () => {
      let maxWeight = 0;
      for (const fund of sectorFunds.values()) {
        for (const sector of fund.sectors) {
          maxWeight = Math.max(maxWeight, sector.weightPct);
        }
      }
      document.querySelectorAll(".table__asset-head").forEach((node) => {
        if (node instanceof HTMLElement) {
          node.textContent = "Sector";
        }
      });
      return populate(
        sectorConfigs,
        sectorFunds,
        sectorFailures,
        renderSectorFund,
        "sectors",
        maxWeight,
      );
    };

    /** @type {ViewKind} */
    let activeKind = "stocks";
    /** @type {Map<string, FundList>} */
    let activeLists = new Map();

    const mobileQuery = window.matchMedia("(max-width: 720px)");

    /**
     * Show or hide one panel body.
     * @param {FundRefs} panel - The panel elements.
     * @param {boolean} collapsed - True to hide the list.
     * @returns {void}
     */
    const setCollapsed = (panel, collapsed) => {
      panel.root.dataset.collapsed = collapsed ? "true" : "false";
      panel.toggle.setAttribute("aria-expanded", String(!collapsed));
      const ticker = panel.root.dataset.fund || "";
      const noun = activeKind === "sectors" ? "sectors" : "holdings";
      panel.toggle.setAttribute(
        "aria-label",
        `${ticker} ${collapsed ? "show" : "hide"} ${noun}`,
      );
    };

    const syncPanels = () => {
      setCollapsed(refs.SPY, mobileQuery.matches);
      setCollapsed(refs.QQQ, mobileQuery.matches);
    };

    for (const ticker of ["SPY", "QQQ"]) {
      const panel = refs[ticker];
      panel.toggle.addEventListener("click", () => {
        if (!mobileQuery.matches) {
          return;
        }
        const wasCollapsed = panel.root.dataset.collapsed === "true";
        setCollapsed(refs.SPY, true);
        setCollapsed(refs.QQQ, true);
        if (wasCollapsed) {
          panel.scroll.scrollTop = 0;
          setCollapsed(panel, false);
        }
      });
    }

    mobileQuery.addEventListener("change", syncPanels);

    let frame = 0;
    /**
     * Filter the active view.
     * @returns {void}
     */
    const applyFilter = () => {
      const query = input.value.trim();
      const noun = activeKind === "sectors" ? "sectors" : "holdings";
      let visible = 0;
      let total = 0;
      for (const list of activeLists.values()) {
        const result = list.filter(query);
        visible += result.visible;
        total += result.total;
      }

      if (total === 0) {
        status.textContent = `The ${noun} did not load. Run the fetch script.`;
        return;
      }

      if (query !== "") {
        status.textContent = `${visible} of ${total} ${noun} match ${query}.`;
        return;
      }

      status.textContent = `${total} ${noun} across ${activeLists.size} ${
        activeLists.size === 1 ? "fund" : "funds"
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

    /** @type {HTMLButtonElement[]} */
    const viewButtons = [];
    document.querySelectorAll(".view-toggle__btn").forEach((node) => {
      if (node instanceof HTMLButtonElement) {
        viewButtons.push(node);
      }
    });

    /**
     * Switch the active view.
     * @param {ViewKind} kind - The next view.
     * @returns {void}
     */
    const setView = (kind) => {
      if (kind === activeKind && activeLists.size > 0) {
        return;
      }
      activeKind = kind;
      for (const button of viewButtons) {
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.view === kind),
        );
      }
      input.value = "";
      input.placeholder =
        kind === "sectors"
          ? "Search SPY and QQQ sectors"
          : "Search SPY and QQQ by symbol or name";
      input.setAttribute(
        "aria-label",
        kind === "sectors"
          ? "Search SPY and QQQ sectors"
          : "Search SPY and QQQ holdings",
      );
      activeLists =
        kind === "sectors" ? renderSectorView() : renderStockView();
      syncPanels();
      applyFilter();

      const failures =
        kind === "sectors" ? sectorFailures : stockFailures;
      if (failures.size > 0) {
        const loadedTotal = [...activeLists.values()].reduce(
          (sum, list) => sum + list.total,
          0,
        );
        const noun = kind === "sectors" ? "sectors" : "holdings";
        if (activeLists.size === 0) {
          status.textContent = `The ${noun} did not load. Run the fetch script.`;
        } else {
          status.textContent = `${loadedTotal} ${noun} loaded. ${[
            ...failures.keys(),
          ].join(" and ")} did not load.`;
        }
      }
    };

    for (const button of viewButtons) {
      button.disabled = false;
      button.addEventListener("click", () => {
        const kind = button.dataset.view;
        if (kind !== "stocks" && kind !== "sectors") {
          return;
        }
        setView(kind);
      });
    }

    setView("stocks");
    setAppState(
      stockFunds.size > 0 || sectorFunds.size > 0 ? "ready" : "error",
    );
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
