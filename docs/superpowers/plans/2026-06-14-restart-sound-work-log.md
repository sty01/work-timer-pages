# Restart Sound and Work Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** リスタート時の2連音を確実に鳴らし、作業ログを通常閲覧と編集で整理された読みやすい画面にする。

**Architecture:** 既存の静的HTML/CSS/JavaScript構成と保存形式を維持する。音声処理はリスタート専用のハンドラで効果音抑制を解除し、ログUIは各記録を「概要行」と「編集中のみ表示する編集パネル」に分離する。

**Tech Stack:** HTML5、CSS、Vanilla JavaScript、Node.js built-in test runner、localStorage、Cloudflare Pages

---

### Task 1: リスタートの2連音

**Files:**
- Modify: `app.test.js`
- Modify: `app.js:760-995`

- [ ] **Step 1: 失敗する回帰テストを書く**

`app.test.js` に次を追加する。

```js
test('restart always plays two beeps after stopping an active alarm', () => {
  assert.match(appSource, /function restartTimerWithSound\(\)/);
  assert.match(
    appSource,
    /function restartTimerWithSound\(\)\s*\{[\s\S]*stopAlarm\(\);[\s\S]*suppressButtonSoundsUntil = 0;[\s\S]*playDoubleBeep\(\);[\s\S]*restartTimer\(\);[\s\S]*\}/
  );
  assert.match(
    appSource,
    /timerRestart\.addEventListener\('click', restartTimerWithSound\)/
  );
});
```

- [ ] **Step 2: テストが正しい理由で失敗することを確認する**

Run: `node --test --test-name-pattern="restart always plays two beeps" app.test.js`

Expected: `restartTimerWithSound` が存在しないためFAIL。

- [ ] **Step 3: 最小実装を追加する**

`app.js` のタイマーイベント登録直前に次を追加する。

```js
function restartTimerWithSound() {
  stopAlarm();
  suppressButtonSoundsUntil = 0;
  playDoubleBeep();
  restartTimer();
}
```

既存のリスタート登録を置き換える。

```js
timerRestart.addEventListener('click', restartTimerWithSound);
```

- [ ] **Step 4: 対象テストと全テストを通す**

Run: `node --test --test-name-pattern="restart always plays two beeps" app.test.js`

Expected: PASS。

Run: `npm test`

Expected: 全件PASS。

- [ ] **Step 5: コミットする**

```bash
git add app.js app.test.js
git commit -m "fix: keep restart double beep after alarm"
```

### Task 2: 作業ログの閲覧行と編集パネルを分離

**Files:**
- Modify: `app.test.js`
- Modify: `app.js:1090-1345`
- Modify: `styles.css:861-1130`

- [ ] **Step 1: 失敗するUI構造テストを書く**

`app.test.js` に次を追加する。

```js
test('work log separates readable summary rows from expanded edit panels', () => {
  assert.match(appSource, /log-item-summary/);
  assert.match(appSource, /log-time-block/);
  assert.match(appSource, /log-time-label/);
  assert.match(appSource, /log-time-value/);
  assert.match(appSource, /log-edit-fields/);
  assert.match(appSource, /log-edit-group/);
  assert.match(stylesSource, /\.log-item-summary\s*\{/);
  assert.match(stylesSource, /\.log-time-block\s*\{/);
  assert.match(stylesSource, /\.log-edit-fields\s*\{/);
  assert.match(stylesSource, /grid-template-columns:\s*minmax\(150px,\s*1\.2fr\)\s*repeat\(2,\s*minmax\(120px,\s*1fr\)\)\s*auto/);
});

test('work log modal has a wider desktop layout and a stacked mobile layout', () => {
  assert.match(stylesSource, /\.log-modal\s*\{[^}]*width:\s*min\(760px,\s*94vw\)/s);
  assert.match(stylesSource, /@media \(max-width:\s*680px\)[\s\S]*\.log-item-summary\s*\{[^}]*grid-template-columns:\s*1fr auto/s);
  assert.match(stylesSource, /@media \(max-width:\s*680px\)[\s\S]*\.log-time-groups\s*\{[^}]*grid-column:\s*1 \/ -1/s);
});
```

- [ ] **Step 2: テストが正しい理由で失敗することを確認する**

Run: `node --test --test-name-pattern="work log" app.test.js`

Expected: 新しいクラスと幅指定が存在しないためFAIL。

- [ ] **Step 3: 通常表示を概要グリッドへ変更する**

`renderLogList()` で各記録に `log-item-summary` を作り、その中へ日付欄、時間欄、操作欄を入れる。

```js
const summaryDiv = document.createElement('div');
summaryDiv.className = 'log-item-summary';

const timeGroups = document.createElement('div');
timeGroups.className = 'log-time-groups';

function createTimeBlock(label, value, toneClass) {
  const block = document.createElement('div');
  block.className = `log-time-block ${toneClass}`;

  const labelSpan = document.createElement('span');
  labelSpan.className = 'log-time-label';
  labelSpan.textContent = label;

  const valueSpan = document.createElement('strong');
  valueSpan.className = 'log-time-value';
  valueSpan.textContent = value;

  block.append(labelSpan, valueSpan);
  return block;
}

timeGroups.append(
  createTimeBlock(t('log-work-time'), formatJapaneseDuration(record.seconds), 'log-item-duration-work'),
  createTimeBlock(t('log-rest-time'), formatJapaneseDuration(record.restSeconds || 0), 'log-item-duration-rest')
);
```

編集・削除ボタンは記号とツールチップを持つアイコンボタンにする。

```js
editBtn.className = 'log-icon-button edit-log-btn';
editBtn.textContent = '✎';
editBtn.title = t('edit-btn-label');

deleteBtn.className = 'log-icon-button delete-log-btn';
deleteBtn.textContent = '×';
deleteBtn.title = t('aria-delete-btn');
```

- [ ] **Step 4: 編集フォームを縦方向の編集パネルへ変更する**

編集時も概要行を残し、その下に `log-item-edit-form` を追加する。作業時間と休憩時間をそれぞれ `log-edit-group` にまとめ、入力欄群を `log-edit-fields` に入れる。

```js
const fields = document.createElement('div');
fields.className = 'log-edit-fields';

const workGroup = document.createElement('div');
workGroup.className = 'log-edit-group';

const restGroup = document.createElement('div');
restGroup.className = 'log-edit-group';

const editActions = document.createElement('div');
editActions.className = 'log-edit-actions';
editActions.append(saveBtn, cancelBtn);

fields.append(workGroup, restGroup);
editForm.append(fields, editActions);
```

- [ ] **Step 5: デスクトップとモバイルのCSSを実装する**

`styles.css` のログ関連スタイルを次の構造へ更新する。

```css
.log-modal {
  width: min(760px, 94vw);
}

.log-item {
  display: block;
  padding: 0;
}

.log-item-summary {
  display: grid;
  grid-template-columns: minmax(150px, 1.2fr) repeat(2, minmax(120px, 1fr)) auto;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
}

.log-time-groups {
  display: contents;
}

.log-time-block {
  display: grid;
  gap: 3px;
}

.log-time-label {
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 800;
}

.log-time-value {
  font-size: 1rem;
  white-space: nowrap;
}

.log-item-edit-form {
  border-top: 1px solid var(--line);
  padding: 16px;
}

.log-edit-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.log-edit-group {
  display: grid;
  grid-template-columns: auto repeat(3, minmax(58px, 1fr));
  align-items: end;
  gap: 8px;
}

.log-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

@media (max-width: 680px) {
  .log-modal {
    width: min(94vw, 520px);
  }

  .log-item-summary {
    grid-template-columns: 1fr auto;
    gap: 10px;
  }

  .log-time-groups {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .log-edit-fields {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 6: 対象テストと全テストを通す**

Run: `node --test --test-name-pattern="work log" app.test.js`

Expected: PASS。

Run: `npm test`

Expected: 全件PASS。

- [ ] **Step 7: コミットする**

```bash
git add app.js styles.css app.test.js
git commit -m "feat: improve work log readability"
```

### Task 3: キャッシュ更新、ブラウザ検証、デプロイ

**Files:**
- Modify: `index.html:184`

- [ ] **Step 1: 公開キャッシュ用バージョンを更新する**

```html
<script src="app.js?v=20260614-6"></script>
```

- [ ] **Step 2: 静的検証を実行する**

Run: `npm test && node --check app.js && git diff --check`

Expected: テスト全件PASS、構文エラーなし、空白エラーなし。

- [ ] **Step 3: ローカルブラウザで確認する**

確認対象:

- `file:///Users/ys/work-timer-pages/index.html`
- `http://127.0.0.1:4174/?v=20260614-6`

確認内容:

- アラーム鳴動中にリスタートすると、アラーム停止後に2連音が記録される。
- ログの通常行で日付・終了時刻・作業・休憩が重ならない。
- 編集時に作業時間と休憩時間が別グループで展開される。
- 1280px幅と390px幅で横方向にはみ出さない。

- [ ] **Step 4: キャッシュ更新をコミットする**

```bash
git add index.html
git commit -m "chore: refresh work timer assets"
```

- [ ] **Step 5: GitHubへpushする**

Run: `git push origin main`

Expected: `main -> main`。

- [ ] **Step 6: Cloudflare Pages公開版を確認する**

確認URL:

`https://work-timer-watch.pages.dev/?v=20260614-6`

確認内容:

- 読み込まれるスクリプトが `app.js?v=20260614-6`。
- 公開版でもリスタート2連音と新しいログレイアウトが動く。
- `git status --short --branch` が `## main...origin/main`。
