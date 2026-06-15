# Search Console Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add crawlable sitemap, robots rules, and canonical URLs for the verified Cloudflare Pages site.

**Architecture:** Keep the buildless static-site architecture. Add two root-level crawler files and declarative canonical links, with Node tests reading the generated static files directly.

**Tech Stack:** Static HTML, XML sitemap protocol, robots.txt, Node.js test runner, Cloudflare Pages

---

### Task 1: Add Search Metadata Tests

**Files:**
- Modify: `app.test.js`

- [ ] **Step 1: Write failing tests**

Add tests that require:

```js
const sitemapSource = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
const robotsSource = readFileSync(new URL('./robots.txt', import.meta.url), 'utf8');
```

The tests must assert canonical links for both HTML pages, both absolute URLs in the XML sitemap, and an allow-all robots rule with the absolute sitemap URL.

- [ ] **Step 2: Verify the tests fail**

Run:

```bash
npm test
```

Expected: FAIL because `sitemap.xml`, `robots.txt`, and canonical links do not exist.

### Task 2: Add Static Search Console Files

**Files:**
- Create: `sitemap.xml`
- Create: `robots.txt`
- Modify: `index.html`
- Modify: `privacy.html`
- Modify: `README.md`

- [ ] **Step 1: Add canonical links**

Use:

```html
<link rel="canonical" href="https://work-timer-watch.pages.dev/">
```

for the home page and:

```html
<link rel="canonical" href="https://work-timer-watch.pages.dev/privacy.html">
```

for the privacy page.

- [ ] **Step 2: Add the XML sitemap**

Create a UTF-8 sitemap using the standard sitemap namespace and the two canonical absolute URLs. Do not add `lastmod`, `changefreq`, or `priority`.

- [ ] **Step 3: Add robots.txt**

Use:

```text
User-agent: *
Allow: /

Sitemap: https://work-timer-watch.pages.dev/sitemap.xml
```

- [ ] **Step 4: Document Search Console submission**

Add the public sitemap and robots URLs to `README.md`, noting that Search Console should receive `sitemap.xml`.

- [ ] **Step 5: Verify all tests pass**

Run:

```bash
npm test
node --check app.js
git diff --check
```

Expected: 0 failures and 0 syntax or whitespace errors.

### Task 3: Deploy and Verify

**Files:**
- No additional source files

- [ ] **Step 1: Commit and push**

Commit the implementation to `main` and push to `origin`.

- [ ] **Step 2: Verify Cloudflare Pages**

Confirm these URLs return the new content:

```text
https://work-timer-watch.pages.dev/
https://work-timer-watch.pages.dev/sitemap.xml
https://work-timer-watch.pages.dev/robots.txt
```

- [ ] **Step 3: Submit the sitemap**

In the verified Search Console property, submit:

```text
sitemap.xml
```

If authenticated Search Console access is unavailable, report the exact remaining manual action.

