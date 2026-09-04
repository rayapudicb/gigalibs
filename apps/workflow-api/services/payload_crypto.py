"""Authenticated encryption for execution payload checkpoints."""

import json
import os
from base64 import b64decode
from hashlib import sha256
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from config import settings


_NONCE_BYTES = 12
_KEY = b64decode(settings.EXECUTION_PAYLOAD_ENCRYPTION_KEY.get_secret_value(), validate=True)
_CIPHER = AESGCM(_KEY)


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def payload_hash(value: Any) -> str:
    return sha256(canonical_json_bytes(value)).hexdigest()


def encrypt_json(value: Any, *, associated_data: str) -> bytes:
    nonce = os.urandom(_NONCE_BYTES)
    ciphertext = _CIPHER.encrypt(
        nonce,
        canonical_json_bytes(value),
        associated_data.encode("utf-8"),
    )
    return nonce + ciphertext


def decrypt_json(ciphertext: bytes, *, associated_data: str) -> Any:
    if len(ciphertext) <= _NONCE_BYTES:
        raise ValueError("Encrypted payload is truncated")
    plaintext = _CIPHER.decrypt(
        ciphertext[:_NONCE_BYTES],
        ciphertext[_NONCE_BYTES:],
        associated_data.encode("utf-8"),
    )
    return json.loads(plaintext.decode("utf-8"))
