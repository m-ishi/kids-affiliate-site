#!/usr/bin/env python3
"""NOTE API テスト - 下書き作成 → 更新フロー"""
import json
import requests
from pathlib import Path

COOKIE_FILE = Path(__file__).parent / "note-cookies.json"

# Load cookies
cookies = json.loads(COOKIE_FILE.read_text())

# Build session
session = requests.Session()
auth_token = None
for c in cookies:
    session.cookies.set(c["name"], c["value"], domain=c.get("domain", ".note.com"))
    if c["name"] == "note_gql_auth_token":
        auth_token = c["value"]

headers = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Origin": "https://editor.note.com",
    "Referer": "https://editor.note.com/",
}
if auth_token:
    headers["Authorization"] = f"Bearer {auth_token}"
session.headers.update(headers)

# Step 0: ログイン確認
print("=== ログイン確認 ===")
resp = session.get("https://note.com/api/v2/current_user")
print(f"Status: {resp.status_code}")
if resp.status_code == 200:
    data = resp.json()
    print(f"User: {data['data']['nickname']} (@{data['data']['urlname']})")

# Step 1: 空の下書き作成 (エディタと同じリクエスト)
print("\n=== Step 1: 下書き作成 ===")
resp1 = session.post("https://note.com/api/v1/text_notes", json={"template_key": None})
print(f"Status: {resp1.status_code}")
print(f"Headers: {dict(resp1.headers)}")
print(f"Body: {resp1.text[:1000]}")

if resp1.status_code in (200, 201):
    data = resp1.json()
    print(f"\nResponse keys: {list(data.keys())}")
    if "data" in data:
        print(f"Data keys: {list(data['data'].keys()) if isinstance(data['data'], dict) else data['data']}")
        note_key = data.get("data", {}).get("key", "")
        note_id = data.get("data", {}).get("id", "")
        print(f"key: {note_key}")
        print(f"id: {note_id}")

        if note_key:
            # Step 2: 更新 - いくつかのAPIパスを試す
            print(f"\n=== Step 2: 更新テスト (key={note_key}) ===")

            update_payload = {
                "name": "テスト記事 - API投稿テスト",
                "body": "<p>これはAPIからの投稿テストです。</p><p>下書きとして保存されるはずです。</p>",
            }

            # Try v1
            print("\n--- PUT /api/v1/text_notes/{key} ---")
            r = session.put(f"https://note.com/api/v1/text_notes/{note_key}", json=update_payload)
            print(f"Status: {r.status_code}")
            print(f"Body: {r.text[:500]}")

            # Try v2
            print("\n--- PUT /api/v2/notes/{key} ---")
            r2 = session.put(f"https://note.com/api/v2/notes/{note_key}", json=update_payload)
            print(f"Status: {r2.status_code}")
            print(f"Body: {r2.text[:500]}")

            # Try PATCH
            print("\n--- PATCH /api/v1/text_notes/{key} ---")
            r3 = session.patch(f"https://note.com/api/v1/text_notes/{note_key}", json=update_payload)
            print(f"Status: {r3.status_code}")
            print(f"Body: {r3.text[:500]}")
else:
    print(f"\n下書き作成失敗!")
    # Originをnote.comに変更して再試行
    print("\n=== Originをnote.comに変更して再試行 ===")
    session.headers["Origin"] = "https://note.com"
    session.headers["Referer"] = "https://note.com/notes/new"
    resp1b = session.post("https://note.com/api/v1/text_notes", json={"template_key": None})
    print(f"Status: {resp1b.status_code}")
    print(f"Body: {resp1b.text[:1000]}")
