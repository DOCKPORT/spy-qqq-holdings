#!/usr/bin/env python3
"""
Fetch the SPY and QQQ holdings and sectors from TickerInside, and write two JSON
files per fund.

Output:
  data/spy.json
  data/qqq.json
  data/spy_sector.json
  data/qqq_sector.json

Each holdings file holds the fund ticker, the fund name, the holdings date, the source,
the TickerInside page, the credit line, and every holding row. A row holds the
stock ticker, the company name, and the weight in percent. A row with an exact
zero weight is dropped. A tiny positive weight stays, because a very small
position can round to zero.

Each sector file holds the fund ticker, name, holdings date, source, sector
coverage, no-sector percent, weight sum, and one row per sector. A sector row
holds the key, label, and weight in percent.

The script fetches both funds before it writes any file. A fetch error leaves
the old files in place and exits with code 1. Each write goes to a temp file
first, then replaces the old file.

Requires: Python 3.9 or later and tickerinside==0.6.0.

Usage:
  .venv/bin/python scripts/fetch_holdings.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import tickerinside as ti

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
FUNDS = ("SPY", "QQQ")

Holding = dict[str, Any]
Fund = dict[str, Any]
Sector = dict[str, Any]

SECTOR_LABELS = {
    "technology": "Technology",
    "financials": "Financials",
    "health_care": "Health care",
    "consumer_discretionary": "Consumer discretionary",
    "communication_services": "Communication services",
    "industrials": "Industrials",
    "consumer_staples": "Consumer staples",
    "energy": "Energy",
    "utilities": "Utilities",
    "real_estate": "Real estate",
    "materials": "Materials",
}


def sector_label(key: str) -> str:
    """Return the display label for one sector key."""
    label = SECTOR_LABELS.get(key)
    if label:
        return label
    return key.replace("_", " ").capitalize()


def fetch_fund(ticker: str) -> tuple[Fund, Sector, float]:
    """Fetch one fund and return its holdings, sectors, and weight sum.

    A row with an exact zero weight is dropped. A row with no name uses the ticker.
    """
    holdings_result = ti.holdings(ticker, names=True)
    fund_result = ti.fund(ticker)

    name_value = fund_result.data.get("name") if isinstance(fund_result.data, dict) else None
    fund_name = name_value.strip() if isinstance(name_value, str) and name_value.strip() else ticker

    rows: list[Holding] = []
    weight_sum = 0.0

    for row in holdings_result.data:
        symbol_value = row.get("ticker")
        if not isinstance(symbol_value, str) or not symbol_value.strip():
            raise ValueError(f"{ticker}: a holding row holds no ticker.")
        symbol = symbol_value.strip()

        name_raw = row.get("name")
        name = name_raw.strip() if isinstance(name_raw, str) and name_raw.strip() else symbol

        weight_raw = row.get("weight_pct")
        if isinstance(weight_raw, (int, float)) and not isinstance(weight_raw, bool):
            weight = float(weight_raw)
        else:
            weight = 0.0

        if weight == 0.0:
            continue

        rows.append({"symbol": symbol, "name": name, "weightPct": weight})
        weight_sum += weight

    breakdown = fund_result.data.get("breakdown")
    if not isinstance(breakdown, dict):
        raise TypeError(f"{ticker}: the fund file holds no breakdown.")
    sectors_raw = breakdown.get("sectors_pct")
    if not isinstance(sectors_raw, dict) or not sectors_raw:
        raise ValueError(f"{ticker}: the fund file holds no sector map.")

    sector_rows: list[dict[str, Any]] = []
    for key, value in sectors_raw.items():
        if not isinstance(key, str):
            continue
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise TypeError(f"{ticker}: sector {key} holds no number.")
        sector_rows.append(
            {"key": key, "label": sector_label(key), "weightPct": float(value)}
        )
    sector_rows.sort(key=lambda row: float(row["weightPct"]), reverse=True)
    sector_sum = round(sum(float(row["weightPct"]) for row in sector_rows), 4)

    sector: Sector = {
        "ticker": ticker,
        "name": fund_name,
        "holdingsAsOf": holdings_result.holdings_as_of,
        "source": holdings_result.source,
        "sectorCoveragePct": breakdown.get("sector_coverage_pct"),
        "noSectorPct": breakdown.get("no_sector_pct"),
        "weightSumPct": sector_sum,
        "sectors": sector_rows,
    }

    fund: Fund = {
        "ticker": ticker,
        "name": fund_name,
        "holdingsAsOf": holdings_result.holdings_as_of,
        "source": holdings_result.source,
        "pageUrl": holdings_result.page_url,
        "cite": holdings_result.cite,
        "holdings": rows,
    }
    return fund, sector, weight_sum


def write_json(path: Path, payload: dict[str, Any]) -> None:
    """Write one JSON file through a temp file, then replace the old file."""
    temp_path = path.with_name(f"{path.name}.tmp")
    try:
        with temp_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        os.replace(temp_path, path)
    finally:
        if temp_path.exists():
            temp_path.unlink()


def main() -> int:
    """Fetch both funds, then write four files. Return the exit code."""
    try:
        funds = [(ticker, *fetch_fund(ticker)) for ticker in FUNDS]
    except (ti.TickerInsideError, TypeError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    for ticker, fund, sector, weight_sum in funds:
        holdings_path = DATA_DIR / f"{ticker.lower()}.json"
        sector_path = DATA_DIR / f"{ticker.lower()}_sector.json"
        try:
            write_json(holdings_path, fund)
            write_json(sector_path, sector)
        except OSError as error:
            print(f"Error: cannot write the {ticker} files: {error}", file=sys.stderr)
            return 1

        count = len(fund["holdings"])
        top = sector["sectors"][0]
        print(
            f"{ticker}: {count} rows, holdings as of {fund['holdingsAsOf']}, "
            f"source {fund['source']}, weight sum {weight_sum:.4f}"
        )
        print(
            f"{ticker}: {len(sector['sectors'])} sectors, top {top['label']} "
            f"{top['weightPct']:.4f}%, sector weight sum {sector['weightSumPct']:.4f}"
        )
        print(
            f"Wrote {holdings_path.relative_to(REPO_ROOT)} and "
            f"{sector_path.relative_to(REPO_ROOT)}."
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
