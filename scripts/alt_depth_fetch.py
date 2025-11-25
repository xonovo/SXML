#!/usr/bin/env python3
"""Simple helper to fetch multi-level order book data from Binance public API.

Usage:
    python scripts/alt_depth_fetch.py --symbol BTCUSDT --levels 10

The script prints top bid/ask levels in a normalized JSON payload so the
front-end team can plug the data into existing renderers for experimentation.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List

BINANCE_DEPTH_ENDPOINT = "https://api.binance.com/api/v3/depth"


def fetch_depth(symbol: str, levels: int) -> Dict[str, Any]:
    params = urllib.parse.urlencode({"symbol": symbol.upper(), "limit": max(5, min(levels, 1000))})
    url = f"{BINANCE_DEPTH_ENDPOINT}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "ICE-WebApp-Depth-Helper/1.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:  # nosec - read-only public endpoint
        return json.loads(resp.read().decode("utf-8"))


def normalize(depth_payload: Dict[str, Any]) -> Dict[str, Any]:
    def to_rows(entries: List[List[str]], side: str) -> List[Dict[str, float]]:
        rows: List[Dict[str, float]] = []
        for price, qty, *_ in entries:
            try:
                price_val = float(price)
                qty_val = float(qty)
            except (TypeError, ValueError):
                continue
            rows.append({"price": price_val, "volume": qty_val, "side": side})
        return rows

    return {
        "symbol": depth_payload.get("symbol"),
        "lastUpdateId": depth_payload.get("lastUpdateId"),
        "asks": to_rows(depth_payload.get("asks", []), "ask"),
        "bids": to_rows(depth_payload.get("bids", []), "bid"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch depth levels from Binance public API")
    parser.add_argument("--symbol", default="BTCUSDT", help="Trading pair symbol, e.g. EURUSDT or BTCUSDT")
    parser.add_argument("--levels", type=int, default=20, help="Order book depth levels to request (5-1000)")
    args = parser.parse_args()

    try:
        raw = fetch_depth(args.symbol, args.levels)
    except urllib.error.HTTPError as err:
        sys.stderr.write(f"HTTP error: {err.code} {err.reason}\n")
        return 1
    except urllib.error.URLError as err:
        sys.stderr.write(f"Network error: {err.reason}\n")
        return 1
    except json.JSONDecodeError:
        sys.stderr.write("Failed to decode JSON from upstream API\n")
        return 1

    payload = normalize(raw)
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
