"""
Dispatch Bridge  Escripts/dispatch_quick.py

Reads data/extracted_mom.json and POSTs the payload to the configured
Amazon Quick Automate webhook endpoint.

Usage:
    python scripts/dispatch_quick.py

Environment variables:
    QUICK_AUTOMATE_WEBHOOK_URL  (required)  Ethe webhook endpoint URL
"""

import json
import logging
import sys
import time

import requests

# ---------------------------------------------------------------------------
# Module-level constants
# ---------------------------------------------------------------------------

#: Fields that are transmitted in the POST payload even when their value is null.
REQUIRED_NULL_FIELDS: set[str] = {
    "meeting_date",
    "meeting_time_end",
    "assignee",
    "department_ref",
    "priority",
    "deadline",
    "assignee_status",
    "deadline_status",
}

#: Delay in seconds before each retry attempt (exponential backoff: 2s, 4s, 8s).
BACKOFF_SECONDS: list[int] = [2, 4, 8]

#: Per-request connect + read timeout in seconds.
TIMEOUT_SECONDS: int = 30

#: Maximum number of retry attempts for retryable HTTP errors.
MAX_RETRIES: int = 3

# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# load_payload
# ---------------------------------------------------------------------------


def load_payload(path: str) -> dict:
    """Read and parse the MoM JSON payload from *path*.

    Exits with code 1 (without making any HTTP request) if the file is
    missing, unreadable, or contains invalid JSON.

    Args:
        path: Filesystem path to the JSON file (typically
              ``data/extracted_mom.json``).

    Returns:
        Parsed JSON content as a :class:`dict`.
    """
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        logger.error("Payload file not found: %s", path)
        sys.exit(1)
    except json.JSONDecodeError as exc:
        logger.error(
            "Failed to parse JSON from payload file %s: %s", path, exc
        )
        sys.exit(1)
    except OSError as exc:
        logger.error(
            "Read error while loading payload file %s: %s", path, exc
        )
        sys.exit(1)


# ---------------------------------------------------------------------------
# filter_nulls
# ---------------------------------------------------------------------------


def filter_nulls(payload: dict, required_fields: set[str]) -> dict:
    """Remove ``null``-valued fields from *payload*, with exceptions.

    Rules:
    - Shallow pass over the root dict: any key whose value is ``None`` is
      removed **unless** the key is in *required_fields*.
    - Recursive pass: dict-typed values are processed recursively with the
      same *required_fields* set.
    - List-typed values are iterated; any dict items within the list are
      processed recursively.

    Args:
        payload:         The JSON payload dict to filter (mutated in-place).
        required_fields: Set of field names that must be retained even when
                         their value is ``None``.

    Returns:
        The filtered dict (same object, mutated in-place).
    """
    keys_to_delete = []

    for key, value in payload.items():
        if value is None:
            # Retain the field if it belongs to the required set.
            if key not in required_fields:
                keys_to_delete.append(key)
        elif isinstance(value, dict):
            filter_nulls(value, required_fields)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    filter_nulls(item, required_fields)

    for key in keys_to_delete:
        del payload[key]

    return payload


# ---------------------------------------------------------------------------
# post_with_retry  (implemented in task 8.2)
# ---------------------------------------------------------------------------


def post_with_retry(url: str, payload: dict) -> int:
    """POST *payload* as JSON to *url*, retrying on transient failures.

    Retry policy:
    - 2xx response: log success with status code and ``meeting_id``; return
      the status code.
    - 4xx response: log error with status code and response body; exit 1
      immediately  Eno retry.
    - 5xx response, :class:`requests.exceptions.ConnectionError`, or
      :class:`requests.exceptions.Timeout`: retry up to ``MAX_RETRIES``
      times using ``BACKOFF_SECONDS`` delays.  Each retry attempt is logged
      with its attempt number and elapsed time.
    - All retries exhausted: log final failure with ``meeting_id``, attempt
      count, and last error; exit 1.

    Per-request connect + read timeout is ``TIMEOUT_SECONDS`` (30 s).

    Args:
        url:     Webhook endpoint URL.
        payload: Filtered MoM payload dict.  Must contain a ``meeting_id``
                 key for log messages.

    Returns:
        HTTP status code on success (2xx).
    """
    meeting_id = payload.get("meeting_id", "<unknown>")
    attempt = 0

    while True:
        attempt_start = time.time()
        try:
            response = requests.post(
                url,
                json=payload,
                timeout=TIMEOUT_SECONDS,
            )
            elapsed = time.time() - attempt_start
            status = response.status_code

            if 200 <= status < 300:
                logger.info(
                    "Dispatch succeeded  Estatus=%d meeting_id=%s",
                    status,
                    meeting_id,
                )
                return status

            if 400 <= status < 500:
                logger.error(
                    "Dispatch failed with client error  Estatus=%d "
                    "meeting_id=%s body=%s",
                    status,
                    meeting_id,
                    response.text,
                )
                sys.exit(1)

            # 5xx or any unexpected status  Etreat as retryable
            raise _RetryableHTTPError(status, response.text)

        except (
            requests.exceptions.ConnectionError,
            requests.exceptions.Timeout,
            _RetryableHTTPError,
        ) as exc:
            elapsed = time.time() - attempt_start

            if attempt < MAX_RETRIES:
                delay = BACKOFF_SECONDS[attempt]
                logger.warning(
                    "Dispatch attempt %d failed after %.2fs  E"
                    "retrying in %ds: %s",
                    attempt + 1,
                    elapsed,
                    delay,
                    exc,
                )
                time.sleep(delay)
                attempt += 1
            else:
                logger.error(
                    "Dispatch failed after %d attempt(s)  E"
                    "meeting_id=%s last_error=%s",
                    attempt + 1,
                    meeting_id,
                    exc,
                )
                sys.exit(1)


class _RetryableHTTPError(Exception):
    """Internal sentinel raised for 5xx or unexpected HTTP status codes."""

    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"HTTP {status}: {body[:200]}")
        self.status = status
        self.body = body


# ---------------------------------------------------------------------------
# main  (implemented in task 8.3)
# ---------------------------------------------------------------------------


def main() -> None:
    """Entry point for the Dispatch Bridge.

    Reads the webhook URL from the environment, loads and filters the MoM
    payload, then dispatches it via :func:`post_with_retry`.

    Exit codes:
        0  E2xx response received (set implicitly on normal return; the process
            exits 0 when the script finishes without calling ``sys.exit``).
        1  E``QUICK_AUTOMATE_WEBHOOK_URL`` absent/empty, payload file missing
            or unreadable, 4xx response, or all retries exhausted.
    """
    import os

    url = os.environ.get("QUICK_AUTOMATE_WEBHOOK_URL", "").strip()
    if not url:
        logger.error(
            "Configuration error: QUICK_AUTOMATE_WEBHOOK_URL environment "
            "variable is not set or is empty."
        )
        sys.exit(1)

    payload = load_payload("data/extracted_mom.json")
    filtered_payload = filter_nulls(payload, REQUIRED_NULL_FIELDS)
    post_with_retry(url, filtered_payload)


if __name__ == "__main__":
    main()
