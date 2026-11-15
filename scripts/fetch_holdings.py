#!/usr/bin/env python3
"""
Fetch the SPY and QQQ holdings from TickerInside and write one JSON file per fund.

Output:
  data/spy.json
  data/qqq.json

Each file holds the fund ticker, the fund name, the holdings date, the source,
the TickerInside page, the credit line, and every holding row. A row holds the
stock ticker, the company name, and the weight in percent. A zero weight stays,
because a very small position can round to zero.

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


def fetch_fund(ticker: str) -> tuple[Fund, float]:
    """Fetch one fund and return its JSON payload and its weight sum.

    A row with a zero weight stays. A row with no name uses the ticker.
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

        rows.append({"symbol": symbol, "name": name, "weightPct": weight})
        weight_sum += weight

    fund: Fund = {
        "ticker": ticker,
        "name": fund_name,
        "holdingsAsOf": holdings_result.holdings_as_of,
        "source": holdings_result.source,
        "pageUrl": holdings_result.page_url,
        "cite": holdings_result.cite,
        "holdings": rows,
    }
    return fund, weight_sum


def write_json(path: Path, payload: Fund) -> None:
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
    """Fetch both funds, then write both files. Return the exit code."""
    try:
        funds = [(ticker, *fetch_fund(ticker)) for ticker in FUNDS]
    except (ti.TickerInsideError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    for ticker, fund, weight_sum in funds:
        path = DATA_DIR / f"{ticker.lower()}.json"
        try:
            write_json(path, fund)
        except OSError as error:
            print(f"Error: cannot write {path}: {error}", file=sys.stderr)
            return 1

        count = len(fund["holdings"])
        print(
            f"{ticker}: {count} rows, holdings as of {fund['holdingsAsOf']}, "
            f"source {fund['source']}, weight sum {weight_sum:.4f}"
        )
        print(f"Wrote {path.relative_to(REPO_ROOT)}.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
