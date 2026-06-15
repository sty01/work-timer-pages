import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const appSource = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(appSource, context);

const {
  addElapsedSeconds,
  createAlarmController,
  createEmptyState,
  finalizeToday,
  formatDuration,
  getTodayKey,
  addPresetSeconds,
  resetToday,
  restoreRunningSession
} = context;

test('index uses a classic script so it also works when opened directly', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /<script src="app\.js\?v=[\d-]+"><\/script>/);
  assert.doesNotMatch(html, /type="module"/);
});

test('public pages declare their canonical Cloudflare Pages URLs', () => {
  const indexHtml = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const privacyHtml = readFileSync(new URL('./privacy.html', import.meta.url), 'utf8');

  assert.match(
    indexHtml,
    /<link rel="canonical" href="https:\/\/work-timer-watch\.pages\.dev\/">/
  );
  assert.match(
    privacyHtml,
    /<link rel="canonical" href="https:\/\/work-timer-watch\.pages\.dev\/privacy\.html">/
  );
});

test('sitemap lists both canonical public pages', () => {
  const sitemapUrl = new URL('./sitemap.xml', import.meta.url);
  assert.equal(existsSync(sitemapUrl), true);

  const sitemap = readFileSync(sitemapUrl, 'utf8');
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(sitemap, /<loc>https:\/\/work-timer-watch\.pages\.dev\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/work-timer-watch\.pages\.dev\/privacy\.html<\/loc>/);
  assert.doesNotMatch(sitemap, /<lastmod>|<changefreq>|<priority>/);
});

test('robots allows crawling and advertises the sitemap', () => {
  const robotsUrl = new URL('./robots.txt', import.meta.url);
  assert.equal(existsSync(robotsUrl), true);

  const robots = readFileSync(robotsUrl, 'utf8');
  assert.match(robots, /^User-agent: \*\nAllow: \//);
  assert.match(robots, /Sitemap: https:\/\/work-timer-watch\.pages\.dev\/sitemap\.xml/);
  assert.doesNotMatch(robots, /Disallow:\s*\/\s*$/m);
});

test('index does not show the daily history calendar-style section', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /日別記録/);
  assert.doesNotMatch(html, /data-history-list/);
  assert.doesNotMatch(html, /data-empty-history/);
});

test('index keeps the work panels visually obvious without side/date labels', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, />左側</);
  assert.doesNotMatch(html, />右側</);
  assert.doesNotMatch(html, /data-today-label/);
  assert.doesNotMatch(html, /の合計/);
});

test('work panel has one reset button and one end button in the main action row', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /data-work-end[^>]*>作業終了</);
  assert.equal((html.match(/data-work-reset/g) || []).length, 1);
  assert.match(html, /data-work-reset[^>]*>リセット</);
});

test('panel top borders are gray by default, red while running, and blue when stopped', () => {
  assert.match(stylesSource, /\.timer-panel,\s*\.work-panel\s*\{[^}]*border-top:\s*10px solid var\(--muted\)/s);
  assert.match(stylesSource, /\.timer-panel\.is-running,\s*\.work-panel\.is-running\s*\{[^}]*border-top:\s*10px solid var\(--red\)/s);
  assert.match(stylesSource, /\.timer-panel\.is-paused,\s*\.work-panel\.is-paused\s*\{[^}]*border-top:\s*10px solid var\(--blue\)/s);
  assert.match(appSource, /timerPanel\.classList\.toggle\('is-running'/);
  assert.match(appSource, /workPanel\.classList\.toggle\('is-running'/);
  assert.match(appSource, /timerPanel\.classList\.toggle\('is-paused'/);
  assert.match(appSource, /workPanel\.classList\.toggle\('is-paused'/);
  assert.match(appSource, /timerPanel\.style\.borderTopColor\s*=/);
  assert.match(appSource, /workPanel\.style\.borderTopColor\s*=/);
});

test('timer offers the requested seven quick presets', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const expectedPresets = [
    ['10', '\\+10秒'],
    ['30', '\\+30秒'],
    ['60', '\\+1分'],
    ['300', '\\+5分'],
    ['600', '\\+10分'],
    ['1800', '\\+30分'],
    ['3600', '\\+1時間']
  ];

  for (const [seconds, label] of expectedPresets) {
    assert.match(html, new RegExp(`data-preset-seconds="${seconds}">${label}<`));
  }

  assert.equal((html.match(/data-preset-seconds=/g) || []).length, 7);
  assert.doesNotMatch(html, /data-preset-minutes/);
});

test('timer presets stay compact in one row', () => {
  assert.match(stylesSource, /\.preset-row\s*\{[^}]*grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(stylesSource, /\.preset-row button\s*\{[^}]*min-height:\s*32px/s);
});

test('preset seconds are added to the configured timer instead of replacing it', () => {
  assert.equal(addPresetSeconds(0, 10), 10);
  assert.equal(addPresetSeconds(10, 30), 40);
  assert.equal(addPresetSeconds(300, 30), 330);
  assert.equal(addPresetSeconds(86390, 30), 86399);
});

test('stop button pauses the timer and uses the dedicated confirmation sound', () => {
  assert.doesNotMatch(appSource, /function handleTimerStop/);
  assert.match(appSource, /timerStop\.disabled = !timerInterval && !isAlarmActive\(\)/);
  assert.doesNotMatch(appSource, /timerStop\.addEventListener\([^;]*playButtonBeep/s);
});

test('start button is disabled while the timer is running', () => {
  assert.match(appSource, /timerStart\.disabled = Boolean\(timerInterval\) \|\| isAlarmActive\(\) \|\| \(timerRemainingSeconds <= 0 && getConfiguredTimerSeconds\(\) <= 0\)/);
});

test('work start button is disabled while working, and work rest button is disabled while resting, and work end button is disabled when time is zero', () => {
  assert.match(appSource, /workStart\.disabled = state\.currentSession\.status === 'working'/);
  assert.match(appSource, /workRest\.disabled = state\.currentSession\.status === 'resting'/);
  assert.match(appSource, /workEnd\.disabled = displaySeconds === 0 && restSeconds === 0/);
});

test('time inputs have a compact clear icon that returns the timer to zero', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /data-timer-clear/);
  assert.match(html, /aria-label="設定時間をゼロに戻す"/);
  assert.match(html, /class="reset-arrow-icon"/);
  assert.doesNotMatch(html, />[↻⟳]</);
  assert.match(appSource, /function clearConfiguredTimer/);
  assert.match(appSource, /timerHours\.value = 0/);
  assert.match(appSource, /timerMinutes\.value = 0/);
  assert.match(appSource, /timerSeconds\.value = 0/);
});

test('timer has restart control and audio hooks', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /data-timer-restart/);
  assert.match(html, />リスタート</);
  assert.match(appSource, /function restartTimer/);
  assert.match(appSource, /playButtonBeep/);
  assert.match(appSource, /playTimerAlarm/);
});

test('audio waits for browser unlock before scheduling tones', () => {
  assert.match(appSource, /async function unlockAudio/);
  assert.match(appSource, /await audioContext\.resume\(\)/);
  assert.match(appSource, /async function playTone/);
  assert.match(appSource, /await unlockAudio\(\)/);
  assert.match(appSource, /pointerdown/);
});

test('audio has an HTMLAudio fallback for browsers that do not output Web Audio', () => {
  assert.match(appSource, /function createBeepDataUrl/);
  assert.match(appSource, /new Audio/);
  assert.match(appSource, /playAudioElement/);
  assert.match(appSource, /audio\.play\(\)/);
});

test('alarm audio uses a dedicated two-pulse alarm-clock waveform', () => {
  assert.match(appSource, /function createAlarmClockDataUrl/);
  assert.match(appSource, /const pulseWindows = \[\[0, 0\.16\], \[0\.24, 0\.40\]\]/);
  assert.match(appSource, /new Audio\(createAlarmClockDataUrl\(\)\)/);
  assert.doesNotMatch(appSource, /alarmAudio = new Audio\(createBeepDataUrl/);
});

test('pressing any button stops the active timer alarm before the button action', () => {
  assert.match(
    appSource,
    /document\.addEventListener\('pointerdown', stopAlarmForButtonPress, true\)/
  );
});

test('alarm uses one stoppable loop instead of scheduled Web Audio tones', () => {
  assert.match(appSource, /alarmAudio\.loop = true/);
  assert.doesNotMatch(appSource, /setInterval\(playTimerAlarm/);
  assert.doesNotMatch(appSource, /activeAlarmTones/);
  assert.match(appSource, /navigator\.vibrate\(0\)/);
  assert.match(appSource, /suppressButtonSoundsUntil/);
  assert.match(appSource, /function shouldSuppressButtonSound/);
});

test('alarm controller stays stopped even when a pending play resolves late', async () => {
  assert.equal(typeof createAlarmController, 'function');

  let resolvePlay;
  const audio = {
    loop: false,
    currentTime: 0,
    playCalls: 0,
    pauseCalls: 0,
    play() {
      this.playCalls += 1;
      return new Promise((resolve) => {
        resolvePlay = resolve;
      });
    },
    pause() {
      this.pauseCalls += 1;
    }
  };

  const controller = createAlarmController(audio);
  controller.start();
  controller.stop();

  assert.equal(controller.isActive(), false);
  assert.equal(audio.pauseCalls, 1);
  assert.equal(audio.currentTime, 0);

  resolvePlay();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(controller.isActive(), false);
  assert.equal(audio.pauseCalls, 2);
  assert.equal(audio.currentTime, 0);
});

test('stop button stops the alarm before playing one lower confirmation beep', () => {
  assert.match(appSource, /function playStopBeep\(\) \{\s*playTone\(760, 0\.08, 0, 0\.13\);\s*\}/);
  assert.match(
    appSource,
    /timerStop\.addEventListener\('click', \(\) => \{\s*stopTimer\('停止中'\);\s*playStopBeep\(\);\s*\}\)/
  );
});

test('restart always plays two beeps after stopping an active alarm', () => {
  assert.match(appSource, /function restartTimerWithSound\(\)/);
  assert.match(
    appSource,
    /function restartTimerWithSound\(\)\s*\{[\s\S]*stopAlarm\(\);[\s\S]*suppressButtonSoundsUntil = 0;[\s\S]*restartTimer\(\);[\s\S]*playDoubleBeep\(\);[\s\S]*\}/
  );
  assert.doesNotMatch(
    appSource,
    /function restartTimer\(\)\s*\{\s*stopAlarm\(\);/
  );
  assert.match(
    appSource,
    /timerRestart\.addEventListener\('click', restartTimerWithSound\)/
  );
});

test('double beep uses the quicker 0.08 second spacing', () => {
  assert.match(
    appSource,
    /function playDoubleBeep\(\) \{[\s\S]*playTone\(1200, 0\.06, 0, 0\.16\);[\s\S]*playTone\(1200, 0\.06, 0\.08, 0\.16\);[\s\S]*\}/
  );
  assert.doesNotMatch(appSource, /playTone\(1200, 0\.1, 0\.12, 0\.16\)/);
});

test('formatDuration shows hours, minutes, and seconds', () => {
  assert.equal(formatDuration(3661), '01:01:01');
  assert.equal(formatDuration(0), '00:00:00');
});

test('restoreRunningSession adds elapsed time only while work is active', () => {
  const active = {
    ...createEmptyState('2026-06-11'),
    currentSession: {
      date: '2026-06-11',
      seconds: 120,
      status: 'working',
      lastUpdatedAt: 1_000
    }
  };

  const restoredActive = restoreRunningSession(active, 61_000, '2026-06-11');
  assert.equal(restoredActive.currentSession.seconds, 180);
  assert.equal(restoredActive.currentSession.status, 'working');

  const resting = {
    ...active,
    currentSession: {
      ...active.currentSession,
      status: 'resting'
    }
  };

  const restoredResting = restoreRunningSession(resting, 61_000, '2026-06-11');
  assert.equal(restoredResting.currentSession.seconds, 120);
});

test('finalizeToday adds the session as a new record entry and clears the session', () => {
  const state = {
    records: [
      { id: '1', date: '2026-06-11', endTime: '09:00', seconds: 300 }
    ],
    currentSession: {
      date: '2026-06-11',
      seconds: 600,
      status: 'working',
      lastUpdatedAt: 1_000
    }
  };

  const finished = finalizeToday(state, 31_000, '2026-06-11');
  const june11Records = finished.records.filter(r => r.date === '2026-06-11');
  assert.equal(june11Records.length, 2);
  assert.equal(june11Records[0].seconds, 300);
  assert.equal(june11Records[1].seconds, 630);
  assert.deepEqual(JSON.parse(JSON.stringify(finished.currentSession)), {
    date: '2026-06-11',
    seconds: 0,
    restSeconds: 0,
    status: 'idle',
    lastUpdatedAt: 31_000
  });
});

test('resetToday clears all records for today but keeps other dates', () => {
  const state = {
    records: [
      { id: '1', date: '2026-06-10', endTime: '17:00', seconds: 120 },
      { id: '2', date: '2026-06-11', endTime: '18:00', seconds: 300 }
    ],
    currentSession: {
      date: '2026-06-11',
      seconds: 600,
      status: 'working',
      lastUpdatedAt: 1_000
    }
  };

  const reset = resetToday(state, 31_000, '2026-06-11');
  assert.equal(reset.records.length, 1);
  assert.equal(reset.records[0].date, '2026-06-10');
  assert.equal(reset.records[0].seconds, 120);
  assert.deepEqual(JSON.parse(JSON.stringify(reset.currentSession)), {
    date: '2026-06-11',
    seconds: 0,
    restSeconds: 0,
    status: 'idle',
    lastUpdatedAt: 31_000
  });
});

test('date helpers and elapsed math are stable', () => {
  assert.equal(getTodayKey(new Date('2026-06-11T15:30:00+09:00')), '2026-06-11');
  assert.equal(addElapsedSeconds(10, 1_000, 4_900), 13);
  assert.equal(addElapsedSeconds(10, 4_900, 1_000), 10);
});

test('restoreRunningSession preserves sub-second remainder across repeated saves', () => {
  let state = {
    ...createEmptyState('2026-06-11', 0),
    currentSession: {
      date: '2026-06-11',
      seconds: 0,
      status: 'working',
      lastUpdatedAt: 0
    }
  };

  state = restoreRunningSession(state, 900, '2026-06-11');
  state = restoreRunningSession(state, 1_800, '2026-06-11');
  state = restoreRunningSession(state, 2_700, '2026-06-11');

  assert.equal(state.currentSession.seconds, 2);
  assert.equal(state.currentSession.lastUpdatedAt, 2_000);
});

test('lastConfiguredSeconds is normalized and preserved across session states', () => {
  const initial = {
    ...createEmptyState('2026-06-11'),
    lastConfiguredSeconds: 1500
  };

  const normalized = restoreRunningSession(initial, 1000, '2026-06-11');
  assert.equal(normalized.lastConfiguredSeconds, 1500);

  const finalized = finalizeToday(normalized, 2000, '2026-06-11');
  assert.equal(finalized.lastConfiguredSeconds, 1500);

  const resetState = resetToday(finalized, 3000, '2026-06-11');
  assert.equal(resetState.lastConfiguredSeconds, 1500);
});

test('work panel allows editing work time inputs and saving them', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /data-work-edit-container/);
  assert.match(html, /data-work-edit-hours/);
  assert.match(html, /data-work-edit-minutes/);
  assert.match(html, /data-work-edit-seconds/);
  assert.match(html, /data-work-click="hours"/);
  assert.match(html, /data-work-click="minutes"/);
  assert.match(html, /data-work-click="seconds"/);
  assert.match(appSource, /workDisplay\.addEventListener\('click'/);
  assert.match(appSource, /function saveEditedWorkTime/);
});

test('work panel has work-end button, view-log button, and dialog markup', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /data-work-end/);
  assert.match(html, /data-view-log/);
  assert.match(html, /id="log-dialog"/);
  assert.match(html, /class="log-list-container"/);
  assert.match(appSource, /workEnd\.addEventListener\('click'/);
  assert.match(appSource, /viewLog\.addEventListener\('click'/);
});

test('log dialog list supports inline edit elements, forms, and event handling', () => {
  assert.match(appSource, /log-item-edit-form/);
  assert.match(appSource, /save-log-btn/);
  assert.match(appSource, /cancel-log-btn/);
  assert.match(appSource, /edit-log-btn/);
  assert.match(appSource, /log-edit-hours/);
  assert.match(appSource, /log-edit-minutes/);
  assert.match(appSource, /log-edit-seconds/);
  assert.match(stylesSource, /\.log-item-edit-form/);
  assert.match(stylesSource, /\.save-log-btn/);
  assert.match(stylesSource, /\.cancel-log-btn/);
});

test('work log editing updates both work time and rest time', () => {
  assert.match(appSource, /log-edit-rest-hours/);
  assert.match(appSource, /log-edit-rest-minutes/);
  assert.match(appSource, /log-edit-rest-seconds/);
  assert.match(appSource, /record\.seconds = newTotal/);
  assert.match(appSource, /record\.restSeconds = newRestTotal/);
});

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
  assert.match(
    stylesSource,
    /grid-template-columns:\s*minmax\(150px,\s*1\.2fr\)\s*repeat\(2,\s*minmax\(120px,\s*1fr\)\)\s*auto/
  );
});

test('work log modal has a wider desktop layout and a stacked mobile layout', () => {
  assert.match(stylesSource, /\.log-modal\s*\{[^}]*width:\s*min\(760px,\s*94vw\)/s);
  assert.match(
    stylesSource,
    /@media \(max-width:\s*680px\)[\s\S]*\.log-item-summary\s*\{[^}]*grid-template-columns:\s*1fr auto/s
  );
  assert.match(
    stylesSource,
    /@media \(max-width:\s*680px\)[\s\S]*\.log-time-groups\s*\{[^}]*grid-column:\s*1 \/ -1/s
  );
});

test('finalizeToday saves end time in record, and resetToday removes records for that date', () => {
  const now = new Date('2026-06-11T18:30:00').getTime();
  const state = {
    records: [],
    currentSession: {
      date: '2026-06-11',
      seconds: 600,
      status: 'idle',
      lastUpdatedAt: now
    }
  };

  // Test finalizeToday saves the time (e.g. 18:30)
  const finished = finalizeToday(state, now, '2026-06-11');
  const june11Records = finished.records.filter(r => r.date === '2026-06-11');
  assert.equal(june11Records.length, 1);
  assert.equal(june11Records[0].endTime, '18:30');
  assert.equal(june11Records[0].seconds, 600);

  // Test resetToday clears all records for that date
  const reset = resetToday(finished, now, '2026-06-11');
  assert.equal(reset.records.filter(r => r.date === '2026-06-11').length, 0);
});

test('DOM structure and CSS style for log-item-endtime are defined', () => {
  assert.match(appSource, /log-item-left/);
  assert.match(appSource, /log-item-endtime/);
  assert.match(stylesSource, /\.log-item-left/);
  assert.match(stylesSource, /\.log-item-endtime/);
});

test('work log keeps the date and end time on one horizontal row', () => {
  assert.match(
    stylesSource,
    /\.log-item-left\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*gap:\s*6px[^}]*flex-wrap:\s*nowrap/s
  );
  assert.match(stylesSource, /\.log-item-date\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(stylesSource, /\.log-item-endtime\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(
    stylesSource,
    /@media \(max-width:\s*680px\)[\s\S]*\.log-item-left\s*\{[^}]*gap:\s*4px/s
  );
  assert.match(
    stylesSource,
    /@media \(max-width:\s*680px\)[\s\S]*\.log-item-endtime\s*\{[^}]*font-size:\s*0\.62rem[^}]*padding:\s*2px 4px/s
  );
});

test('restoreRunningSession adds elapsed time to restSeconds while resting', () => {
  const resting = {
    records: [],
    currentSession: {
      date: '2026-06-11',
      seconds: 120,
      restSeconds: 300,
      status: 'resting',
      lastUpdatedAt: 1_000
    }
  };

  const restored = restoreRunningSession(resting, 61_000, '2026-06-11');
  assert.equal(restored.currentSession.seconds, 120); // work time stays the same
  assert.equal(restored.currentSession.restSeconds, 360); // 300 + 60 elapsed seconds
});

test('finalizeToday saves restSeconds into historical records', () => {
  const state = {
    records: [],
    currentSession: {
      date: '2026-06-11',
      seconds: 120,
      restSeconds: 300,
      status: 'idle',
      lastUpdatedAt: 1_000
    }
  };

  const finished = finalizeToday(state, 1_000, '2026-06-11');
  const records = finished.records.filter(r => r.date === '2026-06-11');
  assert.equal(records.length, 1);
  assert.equal(records[0].seconds, 120);
  assert.equal(records[0].restSeconds, 300);
});

test('total bound time is removed while rest time remains', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /data-rest-display/);
  assert.doesNotMatch(html, /data-total-display/);
  assert.doesNotMatch(html, /総拘束時間/);
  assert.doesNotMatch(appSource, /totalDisplay/);
  assert.doesNotMatch(appSource, /log-item-duration-total/);
  assert.doesNotMatch(appSource, /`合計 \$\{/);
  assert.match(appSource, /log-item-durations/);
  assert.match(stylesSource, /\.secondary-time-displays/);
  assert.match(stylesSource, /\.log-item-durations/);
});

test('DOM structure and CSS style for volume control are defined', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /data-volume-slider/);
  assert.match(html, /data-volume-percentage/);
  assert.match(html, /data-volume-mute-toggle/);
  assert.match(html, /class="mute-slash"/);
  assert.match(html, /<label for="volume-slider" data-i18n="volume-label">音量<\/label>/);
  assert.match(html, /<h1 data-i18n="hero-title">作業タイマー＆ウォッチ<\/h1>/);
  assert.match(html, /class="volume-control-container"/);
  assert.match(html, /class="lang-selector"/);
  assert.match(html, /data-lang="ja"/);
  assert.match(html, /data-lang="en"/);
  assert.match(appSource, /VOLUME_STORAGE_KEY/);
  assert.match(appSource, /MUTE_STORAGE_KEY/);
  assert.match(stylesSource, /\.volume-control-container/);
  assert.match(stylesSource, /\.volume-mute-toggle/);
  assert.match(stylesSource, /\.mute-slash/);
  assert.match(stylesSource, /\.lang-selector/);
  assert.match(stylesSource, /\.lang-btn/);
});

test('desktop layout fits the viewport while mobile remains scrollable', () => {
  assert.match(stylesSource, /body\s*\{[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/s);
  assert.match(stylesSource, /@media \(min-width:\s*821px\) and \(max-height:\s*900px\)/);
  assert.match(
    stylesSource,
    /@media \(max-width:\s*820px\)\s*\{[^}]*body\s*\{[^}]*height:\s*auto[^}]*overflow-y:\s*auto/s
  );
});

test('modal-footer and Delete All button are defined', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /class="modal-footer"/);
  assert.match(html, /data-delete-all-logs/);
  assert.match(appSource, /deleteAllBtn/);
  assert.match(appSource, /t\('delete-all-confirm'\)/);
  assert.match(stylesSource, /\.log-modal \.modal-footer/);
  assert.match(stylesSource, /\.delete-all-btn/);
});
