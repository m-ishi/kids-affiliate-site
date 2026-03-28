#!/usr/bin/env python3
"""
記事テキストファイルをWordPress WXR形式XMLに変換
→ noteのインポート機能で一括取り込み可能
"""
import os
import re
import html
from pathlib import Path
from datetime import datetime, timedelta

ARTICLES_DIR = Path(__file__).parent
OUTPUT_FILE = ARTICLES_DIR / "note-import.xml"

# strider-14xは既にnoteに公開済みなので除外
SKIP_FILES = {"strider-14x.txt"}

def text_to_html(text):
    """テキスト本文をHTML形式に変換（noteが解釈できる形式）"""
    lines = text.split("\n")
    html_parts = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("## "):
            heading = html.escape(stripped[3:])
            html_parts.append(f"<h2>{heading}</h2>")
        elif stripped.startswith("> "):
            quote = html.escape(stripped[2:])
            html_parts.append(f"<blockquote>{quote}</blockquote>")
        elif stripped == "---":
            html_parts.append("<hr />")
        elif stripped.startswith("・**") and stripped.endswith("**"):
            # 太字箇条書き
            content = html.escape(stripped[3:-2])
            html_parts.append(f"<p><strong>{content}</strong></p>")
        elif stripped.startswith("・"):
            content = html.escape(stripped[1:])
            html_parts.append(f"<p>・{content}</p>")
        elif stripped.startswith("▶"):
            # CTAリンク行
            content = html.escape(stripped)
            html_parts.append(f"<p>{content}</p>")
        elif stripped.startswith("http://") or stripped.startswith("https://"):
            # URLは埋め込みリンクとして
            url = stripped.strip()
            html_parts.append(f'<p><a href="{html.escape(url)}">{html.escape(url)}</a></p>')
        else:
            # 太字の**...**をHTMLに変換
            escaped = html.escape(stripped)
            escaped = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', escaped)
            html_parts.append(f"<p>{escaped}</p>")

    return "\n".join(html_parts)


def extract_hashtags(title, body):
    """記事内容からハッシュタグを自動生成"""
    tags = set()
    keyword_tags = {
        "知育": "知育玩具", "マグフォーマー": "マグフォーマー",
        "ストライダー": "ストライダー", "レゴ": "レゴ",
        "くもん": "くもん", "将棋": "将棋", "メルちゃん": "メルちゃん",
        "プラレール": "プラレール", "アンパンマン": "アンパンマン",
        "スキップホップ": "スキップホップ", "シュナグル": "シュナグル",
        "ベビーゲート": "ベビーゲート", "スマートゲイト": "安全対策",
        "リッチェル": "リッチェル", "フィッシャープライス": "知育玩具",
        "デュプロ": "レゴデュプロ", "ベビーバス": "ベビーバス",
    }
    full_text = title + " " + body
    for keyword, tag in keyword_tags.items():
        if keyword in full_text:
            tags.add(tag)
    tags.update(["子育て", "育児", "口コミ", "パパ育児"])
    return list(tags)[:10]


def parse_article(filepath):
    """1行目=タイトル、残り=本文"""
    text = filepath.read_text(encoding="utf-8")
    lines = text.strip().split("\n")
    title = lines[0].strip()
    body = "\n".join(lines[1:]).strip()
    return title, body


def generate_wxr(articles):
    """WordPress WXR形式のXMLを生成"""
    now = datetime.now()

    items_xml = []
    for i, (filepath, title, body_html, tags) in enumerate(articles):
        # 各記事に少しずつ異なる日時を設定
        pub_date = now - timedelta(hours=len(articles) - i)
        date_str = pub_date.strftime("%Y-%m-%d %H:%M:%S")
        rfc_date = pub_date.strftime("%a, %d %b %Y %H:%M:%S +0900")

        # カテゴリ/タグ
        categories_xml = "\n".join([
            f'      <category domain="post_tag" nicename="{html.escape(t)}"><![CDATA[{t}]]></category>'
            for t in tags
        ])

        # 本文をCDATAで囲む
        item = f"""    <item>
      <title><![CDATA[{title}]]></title>
      <link>https://kidsgoodslab.com/{filepath.stem}/</link>
      <pubDate>{rfc_date}</pubDate>
      <dc:creator><![CDATA[papalabo]]></dc:creator>
      <description></description>
      <content:encoded><![CDATA[{body_html}]]></content:encoded>
      <excerpt:encoded><![CDATA[]]></excerpt:encoded>
      <wp:post_id>{i + 100}</wp:post_id>
      <wp:post_date><![CDATA[{date_str}]]></wp:post_date>
      <wp:post_date_gmt><![CDATA[{date_str}]]></wp:post_date_gmt>
      <wp:post_modified><![CDATA[{date_str}]]></wp:post_modified>
      <wp:post_modified_gmt><![CDATA[{date_str}]]></wp:post_modified_gmt>
      <wp:comment_status><![CDATA[open]]></wp:comment_status>
      <wp:ping_status><![CDATA[open]]></wp:ping_status>
      <wp:post_name><![CDATA[{filepath.stem}]]></wp:post_name>
      <wp:status><![CDATA[publish]]></wp:status>
      <wp:post_parent>0</wp:post_parent>
      <wp:menu_order>0</wp:menu_order>
      <wp:post_type><![CDATA[post]]></wp:post_type>
      <wp:post_password><![CDATA[]]></wp:post_password>
      <wp:is_sticky>0</wp:is_sticky>
{categories_xml}
    </item>"""
        items_xml.append(item)

    wxr = f"""<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/"
>
  <channel>
    <title>KidsGoodsLab</title>
    <link>https://kidsgoodslab.com</link>
    <description>パパラボの子育てグッズレビュー</description>
    <language>ja</language>
    <wp:wxr_version>1.2</wp:wxr_version>
    <wp:base_site_url>https://kidsgoodslab.com</wp:base_site_url>
    <wp:base_blog_url>https://kidsgoodslab.com</wp:base_blog_url>

    <wp:author>
      <wp:author_id>1</wp:author_id>
      <wp:author_login><![CDATA[papalabo]]></wp:author_login>
      <wp:author_email><![CDATA[doru0102@gmail.com]]></wp:author_email>
      <wp:author_display_name><![CDATA[パパラボ]]></wp:author_display_name>
    </wp:author>

{chr(10).join(items_xml)}

  </channel>
</rss>"""
    return wxr


def main():
    txt_files = sorted(ARTICLES_DIR.glob("*.txt"))
    txt_files = [f for f in txt_files if f.name not in SKIP_FILES]

    if not txt_files:
        print("記事ファイルが見つかりません")
        return

    articles = []
    for filepath in txt_files:
        title, body = parse_article(filepath)
        body_html = text_to_html(body)
        tags = extract_hashtags(title, body)
        articles.append((filepath, title, body_html, tags))
        print(f"  {filepath.name}: {title[:40]}... ({len(body)}字, tags={len(tags)})")

    wxr_xml = generate_wxr(articles)
    OUTPUT_FILE.write_text(wxr_xml, encoding="utf-8")
    print(f"\n=== WXR XML生成完了 ===")
    print(f"ファイル: {OUTPUT_FILE}")
    print(f"記事数: {len(articles)}")
    print(f"サイズ: {OUTPUT_FILE.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
