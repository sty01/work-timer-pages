# Alarm Sound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain continuous tone with a recognizable repeating alarm-clock pattern and play one short confirmation beep after Stop.

**Architecture:** Keep the existing single looping `HTMLAudioElement` and immediate-stop controller. Generate a patterned WAV containing two short high pulses and a silent gap, then loop that one source. Stop the alarm synchronously before creating a separate low confirmation tone.

**Tech Stack:** Static JavaScript, Web Audio API, generated PCM WAV data URL, Node test runner, GitHub, Cloudflare Pages.

---

### Task 1: Alarm Pattern Generator

**Files:**
- Modify: `app.test.js`
- Modify: `app.js`

- [ ] **Step 1: Write the failing test**

Add assertions that `createAlarmClockDataUrl` exists, uses two pulse windows, and that `getAlarmAudio` uses it instead of the plain beep generator.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL because `createAlarmClockDataUrl` is not defined.

- [ ] **Step 3: Write minimal implementation**

Generate a 1.05-second mono WAV cycle with audible pulses at `0.00-0.16s` and `0.25-0.41s`, a short attack/release envelope, and silence for the remainder. Use approximately `1120Hz` with a quieter second harmonic so it reads as an alarm clock.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS.

### Task 2: Stop Confirmation Beep

**Files:**
- Modify: `app.test.js`
- Modify: `app.js`

- [ ] **Step 1: Write the failing test**

Assert that the Stop handler calls `stopTimer('停止中')` before `playStopBeep()`, and that `playStopBeep` uses one short lower tone without consulting the alarm-suppression guard.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL because `playStopBeep` is not defined.

- [ ] **Step 3: Write minimal implementation**

Add:

```js
function playStopBeep() {
  playTone(760, 0.08, 0, 0.13);
}
```

Change the Stop listener to:

```js
timerStop.addEventListener('click', () => {
  stopTimer('停止中');
  playStopBeep();
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test && node --check app.js`

Expected: all tests pass and syntax check exits successfully.

### Task 3: Cache Version And Deployment

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Update cache version**

Change the script query to the next version so Cloudflare and browsers request the new JavaScript.

- [ ] **Step 2: Verify locally**

Run: `npm test && git diff --check`

Expected: all tests pass and no whitespace errors.

- [ ] **Step 3: Commit and push**

```bash
git add app.js app.test.js index.html docs/superpowers
git commit -m "feat: add alarm-clock sound pattern"
git push origin main
```

- [ ] **Step 4: Verify Cloudflare Pages**

Open `https://work-timer-watch.pages.dev/` with a cache-busting query. Confirm the new script version, run a one-second timer, press Stop, and verify the alarm stops before exactly one confirmation beep plays.
