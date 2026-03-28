#!/usr/bin/env python3
"""NOTE API デバッグ v2 - GraphQL認証トークンを使用"""
import json
import requests
from pathlib import Path

COOKIE_FILE = Path(__file__).parent / "note-cookies.json"

# Load cookies
cookies = json.loads(COOKIE_FILE.read_text())

# Build session
session = requests.Session()
for c in cookies:
    session.cookies.set(c["name"], c["value"], domain=c.get("domain", ".note.com"))

# Extract auth token
auth_token = None
for c in cookies:
    if c["name"] == "note_gql_auth_token":
        auth_token = c["value"]
        break

print(f"Auth token found: {bool(auth_token)}")

# Try with Bearer token
session.headers.update({
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Origin": "https://note.com",
    "Referer": "https://note.com/",
})

if auth_token:
    session.headers["Authorization"] = f"Bearer {auth_token}"

# Try various API endpoints
endpoints = [
    ("GET", "https://note.com/api/v3/me"),
    ("GET", "https://note.com/api/v2/me"),
    ("GET", "https://note.com/api/v1/me"),
    ("GET", "https://note.com/api/v3/users/me"),
    ("GET", "https://note.com/api/v2/users/me"),
    ("GET", "https://note.com/api/v1/users/me"),
    ("GET", "https://note.com/api/v3/creator"),
    ("GET", "https://note.com/api/v2/creator"),
]

for method, url in endpoints:
    try:
        resp = session.get(url)
        status = resp.status_code
        body = resp.text[:200] if resp.text else "(empty)"
        if status == 200:
            print(f"[OK] {url}")
            print(f"  {body}")
        else:
            print(f"[{status}] {url} -> {body[:80]}")
    except Exception as e:
        print(f"[ERR] {url} -> {e}")

# Try GraphQL endpoint
print("\n=== GraphQL Test ===")
gql_query = {
    "operationName": "CurrentUser",
    "variables": {},
    "query": "query CurrentUser { currentUser { id urlname nickname } }"
}
resp = session.post("https://note.com/api/graphql", json=gql_query)
print(f"Status: {resp.status_code}")
print(f"Body: {resp.text[:500]}")

# Try another GQL variant
print("\n=== GraphQL v2 Test ===")
gql_query2 = {
    "query": "{ currentUser { id urlname nickname } }"
}
resp2 = session.post("https://note.com/graphql", json=gql_query2)
print(f"Status: {resp2.status_code}")
print(f"Body: {resp2.text[:500]}")
