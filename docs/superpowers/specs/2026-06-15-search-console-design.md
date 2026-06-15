# Search Console Integration Design

## Goal

Google Search Consoleで確認済みの `https://work-timer-watch.pages.dev/` を、Googleがクロールしやすい静的サイト構成にする。

## Ownership Verification

Search Consoleの所有権確認はすでに完了している。既存のGoogle Analyticsタグを維持し、Search Console専用の新しいIDやmetaタグは追加しない。

## Changes

- `index.html` にホームページのcanonical URLを追加する。
- `privacy.html` にプライバシーポリシーのcanonical URLを追加する。
- ルートに `sitemap.xml` を追加し、ホームページとプライバシーポリシーの絶対URLを掲載する。
- ルートに `robots.txt` を追加し、全クローラーへ全ページを許可してサイトマップの絶対URLを通知する。
- `README.md` に公開後のSearch Console送信先を記載する。

## Sitemap Policy

サイトは2ページの静的構成なので、XMLサイトマップを手動管理する。Googleが正確性を確認できない更新日を残さないため、`lastmod`、`changefreq`、`priority` は使用しない。

## Verification

- 自動テストでcanonical、サイトマップ、robots.txtの内容を確認する。
- `file://` で既存アプリが引き続き動くことを確認する。
- Cloudflare Pagesへデプロイ後、`/sitemap.xml` と `/robots.txt` がHTTP 200で取得できることを確認する。
- 公開ページのcanonical URLを確認する。

