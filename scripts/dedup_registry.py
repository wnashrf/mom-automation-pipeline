import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

REGISTRY_PATH = Path("data/.dedup_registry.json")


def compute_sha256(file_path: str) -> str:
    """Compute SHA-256 hex digest of a file."""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(8192):
            hasher.update(chunk)
    return hasher.hexdigest()


def load_registry(path: Path = REGISTRY_PATH) -> dict:
    """Load the deduplication registry JSON safely."""
    if not path.exists():
        return {"registry_version": "1.0.0", "entries": []}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        logger.warning("Failed to parse registry file %s: %s. Using fallback.", path, exc)
        return {"registry_version": "1.0.0", "entries": []}


def is_duplicate(registry: dict, sha256_hash: str) -> bool:
    """Check if the hash has already been successfully processed."""
    for entry in registry.get("entries", []):
        if entry.get("sha256") == sha256_hash and entry.get("status") == "success":
            return True
    return False


def record_entry(registry: dict, sha256_hash: str, file_path: str, status: str = "success") -> dict:
    """Append or update an entry with UTC timestamp and save atomically."""
    abs_path = str(Path(file_path).resolve())
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    
    # Update existing entry if present
    for entry in registry.get("entries", []):
        if entry.get("sha256") == sha256_hash:
            entry["status"] = status
            entry["processed_at"] = timestamp
            entry["path"] = abs_path
            return registry

    registry.setdefault("entries", []).append({
        "sha256": sha256_hash,
        "path": abs_path,
        "status": status,
        "processed_at": timestamp
    })
    return registry


def save_registry(registry: dict, path: Path = REGISTRY_PATH) -> None:
    """Atomically write the registry to avoid corruption."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(".json.tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, path)