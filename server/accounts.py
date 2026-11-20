"""Password hashing, session tokens and signup rules. Standard library only.

Never log, print or return a password, a token or an Authorization header.
"""

import hashlib
import hmac
import secrets

from errors import APIError


# OWASP's minimum scrypt setting: 128 MiB and about 0.3 s per hash on a laptop.
# Each stored record names its own parameters, so hashes made with another cost
# still verify. Tests lower SCRYPT_N with a fixture in tests/conftest.py; the
# running server never reads it from the environment.
PRODUCTION_SCRYPT_N = 2**17
SCRYPT_N = PRODUCTION_SCRYPT_N
SCRYPT_R = 8
SCRYPT_P = 1
SALT_BYTES = 16
KEY_BYTES = 32
SCRYPT_MAXMEM = 256 * 1024 * 1024
TOKEN_BYTES = 32


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int, key_bytes: int) -> bytes:
    return hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=key_bytes, maxmem=SCRYPT_MAXMEM,
    )


def hash_password(password: str) -> str:
    """Return `scrypt$N$r$p$<salt hex>$<key hex>` with a fresh random salt."""
    salt = secrets.token_bytes(SALT_BYTES)
    key = _scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, KEY_BYTES)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${key.hex()}"


def verify_password(password: str, record: str) -> bool:
    scheme, n, r, p, salt, key = record.split("$")
    if scheme != "scrypt":
        raise ValueError("Unknown password scheme.")
    expected = bytes.fromhex(key)
    actual = _scrypt(password, bytes.fromhex(salt), int(n), int(r), int(p), len(expected))
    return hmac.compare_digest(actual, expected)


# Checked when a login names no account, so a missing email costs the same work.
_unused_records: dict[int, str] = {}


def burn_password_check(password: str) -> None:
    if SCRYPT_N not in _unused_records:
        _unused_records[SCRYPT_N] = hash_password(secrets.token_urlsafe(TOKEN_BYTES))
    verify_password(password, _unused_records[SCRYPT_N])


def new_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def checked_signup(name: str, email: str, password: str) -> tuple[str, str]:
    """Return the trimmed name and normalized email, or raise invalid_request."""
    name = name.strip()
    if not 1 <= len(name) <= 80:
        raise APIError("invalid_request", "Name must be 1 to 80 characters.")
    email = normalize_email(email)
    local, at, domain = email.partition("@")
    if len(email) > 254 or not at or not local or not domain or "@" in domain:
        raise APIError("invalid_request", "Enter a valid email address.")
    if not 8 <= len(password) <= 128:
        raise APIError("invalid_request", "Password must be 8 to 128 characters.")
    return name, email
