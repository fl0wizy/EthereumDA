from __future__ import annotations

import hashlib
import threading
from typing import Iterable, List

_LOCK = threading.Lock()
_SETUP = None  # cached opaque object returned by ckzg.load_trusted_setup


def _trusted_setup():
    """Lazy-load ckzg trusted setup; reuses the one bundled with eth_account."""
    global _SETUP
    if _SETUP is not None:
        return _SETUP
    with _LOCK:
        if _SETUP is not None:
            return _SETUP
        import ckzg  # lazy
        from eth_account.typed_transactions.base import TRUSTED_SETUP
        _SETUP = ckzg.load_trusted_setup(TRUSTED_SETUP, 0)
    return _SETUP


def versioned_hashes(blobs: Iterable[bytes]) -> List[str]:
    """Compute the EIP-4844 versioned hash for each blob.
       vh = 0x01 || sha256(kzg_commitment)[1:]
    Returns lowercase 0x-prefixed hex strings."""
    import ckzg
    ts = _trusted_setup()
    out: List[str] = []
    for blob in blobs:
        commit = ckzg.blob_to_kzg_commitment(bytes(blob), ts)
        h = hashlib.sha256(commit).digest()
        out.append("0x01" + h[1:].hex())
    return out
