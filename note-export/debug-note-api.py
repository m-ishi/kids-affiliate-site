#!/usr/bin/env python3
"""NOTE API デバッグスクリプト"""
import json
import requests
from pathlib import Path

COOKIE_FILE = Path(__file__).parent / "note-cookies.json"

# Load cookies
cookies = json.loads(COOKIE_FILE.read_text())
print("=== Cookies ===")
for c in cookies:
    name = c["name"]
    value = c["value"][:30]
    domain = c.get("domain", "")
    print(f"  {name}={value}... domain={domain}")

# Build session
session = requests.Session()
for c in cookies:
    session.cookies.set(c["name"], c["value"], domain=c.get("domain", ".note.com"))
session.headers.update({
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
})

# Test login
print("\n=== Testing /api/v1/user_profile/me ===")
resp = session.get("https://note.com/api/v1/user_profile/me")
print(f"Status: {resp.status_code}")
print(f"Body: {resp.text[:500]}")

# Try different API endpoints
print("\n=== Testing /api/v2/creators/me ===")
resp2 = session.get("https://note.com/api/v2/creators/me")
print(f"Status: {resp2.status_code}")
print(f"Body: {resp2.text[:500]}")

# Check CSRF token
print("\n=== CSRF Tokens ===")
for name, value in session.cookies.items():
    if "xsrf" in name.lower() or "csrf" in name.lower() or "token" in name.lower():
        print(f"  {name}={value[:50]}...")
