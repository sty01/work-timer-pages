# Beep Spacing and Log End Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2連音を0.12秒間隔へ短縮し、作業ログの日付と終了時刻を同じ横一列に並べる。

**Architecture:** 既存の音声関数とログDOM構造を維持し、定数値とCSS配置だけを小さく変更する。保存形式やタイマー状態管理には触れない。

**Tech Stack:** HTML5、CSS、Vanilla JavaScript、Node.js built-in test runner、Cloudflare Pages

---

### Task 1: 2連音を速くする

**Files:**
- Modify: `app.test.js`
- Modify: `app.js:760-772`

- [ ] **Step 1: 失敗するテストを追加する**

```js
test('double beep uses the quicker 0.12 second spacing', () => {
  assert.match(
    appSource,
    /function playDoubleBeep\(\) \{[\s\S]*playTone\(1200, 0\.1, 0, 0\.16\);[\s\S]*playTone\(1200, 0\.1, 0\.12, 0\.16\);[\s\S]*\}/
  );
  assert.doesNotMatch(appSource, /playTone\(1200, 0\.1, 0\.15, 0\.16\)/);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `node --test --test-name-pattern="double beep uses" app.test.js`

Expected: 現在の遅延が `0.15` のためFAIL。

- [ ] **Step 3: 2音目の遅延を変更する**

```js
function playDoubleBeep() {
  if (shouldSuppressButtonSound()) return;
  playTone(1200, 0.1, 0, 0.16);
  playTone(1200, 0.1, 0.12, 0.16);
}
```

- [ ] **Step 4: 対象テストを通す**

Run: `node --test --test-name-pattern="double beep uses" app.test.js`

Expected: PASS。

### Task 2: 日付と終了時刻を横並びにする

**Files:**
- Modify: `app.test.js`
- Modify: `styles.css:970-1000`

- [ ] **Step 1: 失敗するレイアウトテストを追加する**

```js
test('work log keeps the date and end time on one horizontal row', () => {
  assert.match(
    stylesSource,
    /\.log-item-left\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*gap:\s*8px[^}]*flex-wrap:\s*nowrap/s
  );
  assert.match(stylesSource, /\.log-item-date\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(stylesSource, /\.log-item-endtime\s*\{[^}]*white-space:\s*nowrap/s);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `node --test --test-name-pattern="date and end time" app.test.js`

Expected: `.log-item-left` が現在 `display: grid` のためFAIL。

- [ ] **Step 3: 横並びCSSへ変更する**

```css
.log-item-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}
```

スマートフォンでも収まるよう終了時刻の左右余白を維持し、既存の `white-space: nowrap` を残す。

- [ ] **Step 4: 対象テストと全テストを通す**

Run: `node --test --test-name-pattern="date and end time" app.test.js`

Expected: PASS。

Run: `npm test`

Expected: 全件PASS。

- [ ] **Step 5: 実装をコミットする**

```bash
git add app.js styles.css app.test.js
git commit -m "feat: tighten double beep and align log end time"
```

### Task 3: キャッシュ更新と公開

**Files:**
- Modify: `index.html:18`

- [ ] **Step 1: スクリプトのキャッシュ番号を更新する**

```html
<script src="app.js?v=20260614-7"></script>
```

- [ ] **Step 2: 静的検証を行う**

Run: `npm test && node --check app.js && git diff --check`

Expected: テスト全件PASS、構文・空白エラーなし。

- [ ] **Step 3: ローカルで確認する**

確認対象:

- `file:///Users/ys/work-timer-pages/index.html`
- `http://127.0.0.1:4174/?v=20260614-7`

確認内容:

- 2連音の開始時刻が `0` と `0.12`。
- PC幅と390px幅で日付・終了時刻が同じ行。
- 作業ログに横方向のはみ出しがない。

- [ ] **Step 4: キャッシュ更新をコミットする**

```bash
git add index.html
git commit -m "chore: refresh work timer assets"
```

- [ ] **Step 5: GitHubへpushする**

Run: `git push origin main`

Expected: `main -> main`。

- [ ] **Step 6: Cloudflare Pagesを確認する**

確認URL:

`https://work-timer-watch.pages.dev/?v=20260614-7`

確認内容:

- `app.js?v=20260614-7` が読み込まれる。
- 公開版で2連音とログ横並びが反映される。
- `git status --short --branch` が `## main...origin/main`。
