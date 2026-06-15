# 作業タイマー

Cloudflare Pagesで一般公開するための、ビルド不要な静的Webアプリです。

## Local preview

```bash
npm run dev
```

Open `http://127.0.0.1:4174`.

## Cloudflare Pages

- Build command: なし
- Output directory: プロジェクト直下

## Google Search Console

- Sitemap: `https://work-timer-watch.pages.dev/sitemap.xml`
- Robots: `https://work-timer-watch.pages.dev/robots.txt`
- Search Consoleの「サイトマップ」に `sitemap.xml` を送信する

## AdSense

`index.html` の広告仮枠を、AdSense審査後に本番タグへ差し替えます。
