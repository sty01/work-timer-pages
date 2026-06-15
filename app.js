const STORAGE_KEY = 'work-timer-records-v1';

function getTodayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function formatCompactDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (safeSeconds === 0) return '';
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}h${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

function addPresetSeconds(currentSeconds, presetSeconds) {
  const current = Math.max(0, Math.floor(Number(currentSeconds) || 0));
  const addition = Math.max(0, Math.floor(Number(presetSeconds) || 0));
  return Math.min(86399, current + addition);
}

function createAlarmController(audio) {
  let active = false;
  let playbackVersion = 0;

  function resetAudio() {
    audio.pause();
    audio.currentTime = 0;
  }

  function start() {
    const version = ++playbackVersion;
    active = true;
    audio.loop = true;
    audio.currentTime = 0;

    let playResult;
    try {
      playResult = audio.play();
    } catch {
      active = false;
      return;
    }

    if (playResult && typeof playResult.then === 'function') {
      playResult.then(() => {
        if (!active || version !== playbackVersion) {
          resetAudio();
        }
      }).catch(() => {
        if (version === playbackVersion) active = false;
      });
    }
  }

  function stop() {
    active = false;
    playbackVersion += 1;
    resetAudio();
  }

  return {
    start,
    stop,
    isActive: () => active
  };
}

function addElapsedSeconds(baseSeconds, lastUpdatedAt, now) {
  if (!Number.isFinite(lastUpdatedAt) || !Number.isFinite(now) || now <= lastUpdatedAt) {
    return Math.max(0, Math.floor(baseSeconds || 0));
  }

  return Math.max(0, Math.floor(baseSeconds || 0)) + Math.floor((now - lastUpdatedAt) / 1000);
}

function createEmptyState(today = getTodayKey(), now = Date.now()) {
  return {
    records: [],
    currentSession: {
      date: today,
      seconds: 0,
      restSeconds: 0,
      status: 'idle',
      lastUpdatedAt: now
    }
  };
}

function normalizeState(state, today = getTodayKey(), now = Date.now()) {
  const emptyState = createEmptyState(today, now);
  let currentSession = state?.currentSession ?? emptyState.currentSession;
  let records = [];

  // Parse records
  if (Array.isArray(state?.records)) {
    records = state.records.map(r => ({
      id: String(r.id || Date.now()),
      date: typeof r.date === 'string' ? r.date : today,
      endTime: typeof r.endTime === 'string' ? r.endTime : '',
      seconds: Math.max(0, Math.floor(Number(r.seconds) || 0)),
      restSeconds: Math.max(0, Math.floor(Number(r.restSeconds) || 0))
    }));
  } else if (state?.records && typeof state.records === 'object') {
    // Migrate from old object format { 'YYYY-MM-DD': seconds }
    const oldEndTimes = state.workEndTimes && typeof state.workEndTimes === 'object' ? state.workEndTimes : {};
    records = Object.entries(state.records)
      .filter(([, secs]) => Number(secs) > 0)
      .map(([date, secs]) => ({
        id: String(Date.now()) + '-' + date,
        date,
        endTime: oldEndTimes[date] || '',
        seconds: Math.max(0, Math.floor(Number(secs) || 0)),
        restSeconds: 0
      }));
  }

  // Auto-finalize session from different day
  if (currentSession.date && currentSession.date !== today) {
    const sSec = Math.max(0, Math.floor(Number(currentSession.seconds) || 0));
    const rSec = Math.max(0, Math.floor(Number(currentSession.restSeconds) || 0));
    if (sSec > 0 || rSec > 0) {
      const lastUp = Number.isFinite(currentSession.lastUpdatedAt) ? currentSession.lastUpdatedAt : now;
      const endClock = new Date(lastUp);
      const hh = String(endClock.getHours()).padStart(2, '0');
      const mm = String(endClock.getMinutes()).padStart(2, '0');

      records.push({
        id: String(lastUp),
        date: currentSession.date,
        endTime: `${hh}:${mm}`,
        seconds: sSec,
        restSeconds: rSec
      });
    }

    currentSession = {
      date: today,
      seconds: 0,
      restSeconds: 0,
      status: 'idle',
      lastUpdatedAt: now
    };
  }

  return {
    records,
    currentSession: {
      date: typeof currentSession.date === 'string' ? currentSession.date : today,
      seconds: Math.max(0, Math.floor(Number(currentSession.seconds) || 0)),
      restSeconds: Math.max(0, Math.floor(Number(currentSession.restSeconds) || 0)),
      status: ['working', 'resting', 'idle'].includes(currentSession.status) ? currentSession.status : 'idle',
      lastUpdatedAt: Number.isFinite(currentSession.lastUpdatedAt) ? currentSession.lastUpdatedAt : now
    },
    lastConfiguredSeconds: Math.max(0, Math.floor(Number(state?.lastConfiguredSeconds) || 0))
  };
}

function restoreRunningSession(state, now = Date.now(), today = getTodayKey()) {
  const restored = normalizeState(state, today, now);
  const session = restored.currentSession;

  // No auto-commit on midnight crossing — the session keeps running.
  // Only pressing "作業終了" creates a record.

  const elapsedSeconds = (session.status === 'working' || session.status === 'resting') && now > session.lastUpdatedAt
    ? Math.floor((now - session.lastUpdatedAt) / 1000)
    : 0;

  let seconds = session.seconds;
  let restSeconds = session.restSeconds;

  if (session.status === 'working') {
    seconds = Math.max(0, Math.floor(session.seconds || 0)) + elapsedSeconds;
  } else if (session.status === 'resting') {
    restSeconds = Math.max(0, Math.floor(session.restSeconds || 0)) + elapsedSeconds;
  }

  const lastUpdatedAt = (session.status === 'working' || session.status === 'resting')
    ? session.lastUpdatedAt + elapsedSeconds * 1000
    : now;

  return {
    ...restored,
    currentSession: {
      ...session,
      seconds,
      restSeconds,
      lastUpdatedAt
    }
  };
}

function finalizeToday(state, now = Date.now(), today = getTodayKey()) {
  const restored = restoreRunningSession(state, now, today);
  const session = restored.currentSession;
  const records = [ ...restored.records ];

  if (session.seconds > 0 || session.restSeconds > 0) {
    // Always use the current date/time when the button is pressed
    const endClock = new Date(now);
    const hh = String(endClock.getHours()).padStart(2, '0');
    const mm = String(endClock.getMinutes()).padStart(2, '0');
    records.push({
      id: String(now),
      date: today,
      endTime: `${hh}:${mm}`,
      seconds: session.seconds,
      restSeconds: session.restSeconds
    });
  }

  return {
    ...restored,
    records,
    currentSession: {
      date: today,
      seconds: 0,
      restSeconds: 0,
      status: 'idle',
      lastUpdatedAt: now
    }
  };
}

function setSessionStatus(state, status, now = Date.now(), today = getTodayKey()) {
  const restored = restoreRunningSession(state, now, today);

  return {
    ...restored,
    currentSession: {
      ...restored.currentSession,
      status,
      lastUpdatedAt: now
    }
  };
}

function resetCurrentSession(state, now = Date.now(), today = getTodayKey()) {
  const restored = restoreRunningSession(state, now, today);

  return {
    ...restored,
    currentSession: {
      date: today,
      seconds: 0,
      restSeconds: 0,
      status: 'idle',
      lastUpdatedAt: now
    }
  };
}

function resetToday(state, now = Date.now(), today = getTodayKey()) {
  const restored = restoreRunningSession(state, now, today);
  const records = restored.records.filter(r => r.date !== today);

  return {
    ...restored,
    records,
    currentSession: {
      date: today,
      seconds: 0,
      restSeconds: 0,
      status: 'idle',
      lastUpdatedAt: now
    }
  };
}

function loadState() {
  try {
    const rawState = localStorage.getItem(STORAGE_KEY);
    if (!rawState) return createEmptyState();
    return restoreRunningSession(JSON.parse(rawState));
  } catch {
    return createEmptyState();
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setupApp() {
  const timerPanel = document.querySelector('.timer-panel');
  const workPanel = document.querySelector('.work-panel');
  const timerDisplay = document.querySelector('[data-timer-display]');
  const timerStatus = document.querySelector('[data-timer-status]');
  const timerHours = document.querySelector('[data-timer-hours]');
  const timerMinutes = document.querySelector('[data-timer-minutes]');
  const timerSeconds = document.querySelector('[data-timer-seconds]');
  const timerStart = document.querySelector('[data-timer-start]');
  const timerStop = document.querySelector('[data-timer-stop]');
  const timerReset = document.querySelector('[data-timer-reset]');
  const timerRestart = document.querySelector('[data-timer-restart]');
  const timerClear = document.querySelector('[data-timer-clear]');
  const presetButtons = document.querySelectorAll('[data-preset-seconds]');

  const workDisplay = document.querySelector('[data-work-display]');
  const workStatus = document.querySelector('[data-work-status]');
  const workStart = document.querySelector('[data-work-start]');
  const workRest = document.querySelector('[data-work-rest]');
  const workReset = document.querySelector('[data-work-reset]');
  const workEnd = document.querySelector('[data-work-end]');
  const workEditContainer = document.querySelector('[data-work-edit-container]');
  const workEditHours = document.querySelector('[data-work-edit-hours]');
  const workEditMinutes = document.querySelector('[data-work-edit-minutes]');
  const workEditSeconds = document.querySelector('[data-work-edit-seconds]');

  const viewLog = document.querySelector('[data-view-log]');
  const closeLog = document.querySelector('[data-close-log]');
  const logDialog = document.getElementById('log-dialog');
  const logListContainer = document.querySelector('.log-list-container');
  const deleteAllBtn = document.querySelector('[data-delete-all-logs]');

  let state = loadState();

  // 6/11等のテスト用の過去ログデータを自動クリーンアップ
  if (Array.isArray(state.records)) {
    const originalLength = state.records.length;
    state.records = state.records.filter(r => r.date !== '2026-06-11');
    if (state.records.length !== originalLength) {
      saveState(state);
    }
  }

  const lastSec = state.lastConfiguredSeconds || 0;
  timerHours.value = Math.floor(lastSec / 3600);
  timerMinutes.value = Math.floor((lastSec % 3600) / 60);
  timerSeconds.value = lastSec % 60;
  let timerRemainingSeconds = getConfiguredTimerSeconds();
  let timerInterval = null;
  let timerEndsAt = null;
  let timerMessage = '待機中';
  let audioContext = null;
  let buttonAudio = null;
  let alarmAudio = null;
  let alarmController = null;
  let suppressButtonSoundsUntil = 0;

  const LANG_STORAGE_KEY = 'work-timer-lang-v1';
  let defaultLang = 'ja';
  try {
    const navLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (navLang.startsWith('en')) {
      defaultLang = 'en';
    }
  } catch (e) {
    // ignore
  }
  let currentLang = localStorage.getItem(LANG_STORAGE_KEY) || defaultLang;

  const translations = {
    ja: {
      'title': '作業タイマー | 在宅ワーク用の作業時間記録',
      'meta-desc': '在宅ワークの作業時間を記録できる、ログイン不要 of 作業タイマーです。',
      'hero-title': '作業タイマー＆ウォッチ',
      'hero-lead': '左側が作業タイマー、右側が作業時間カウンターになっています。<br>在宅ワークや勉強の時間管理に最適です。',
      'timer-title': '作業タイマー',
      'work-title': '総作業時間',
      'hour-label': '時',
      'minute-label': '分',
      'second-label': '秒',
      'clear-title': '設定時間をゼロに戻す',
      'btn-start': 'スタート',
      'btn-stop': 'ストップ',
      'btn-reset': 'リセット',
      'btn-restart': 'リスタート',
      'btn-work-start': '作業開始',
      'btn-work-rest': '休憩',
      'btn-work-reset': 'リセット',
      'btn-work-end': '作業終了',
      'btn-view-log': '作業ログを見る',
      'volume-label': '音量',
      'footer-title': '作業タイマー',
      'footer-desc': '在宅ワークの作業時間をブラウザ内に保存する無料ツールです。',
      'footer-policy': 'プライバシーポリシー',
      'modal-title': '作業ログ',
      'close-log': '閉じる',

      'status-idle': '待機中',
      'status-running': '進行中',
      'status-paused': '停止中',
      'status-resting': '休憩中',
      'status-time-up': '時間になりました',

      'status-working': '作業中',

      'rest-label': '休憩時間',
      'no-logs': '記録された作業ログはありません。',
      'log-ended-at': '終了',
      'log-work-time': '作業',
      'log-rest-time': '休憩',
      'delete-confirm-label': 'のログを削除しますか？',

      'edit-save': '保存',
      'edit-cancel': 'キャンセル',
      'edit-btn-label': '編集',
      'aria-edit-btn': 'このログを編集',
      'aria-delete-btn': 'このログを削除',
      'toast-saved': 'ログに記録しました！',
      'btn-delete-all': '全件削除',
      'delete-all-confirm': 'すべての作業ログを削除しますか？\n（この操作は取り消せません）'
    },
    en: {
      'title': 'Work Timer | Time Tracking for Remote Work',
      'meta-desc': 'A simple, login-free work timer to track and record your working hours.',
      'hero-title': 'Work Timer & Watch',
      'hero-lead': 'Use the left timer for tasks and the right timer to track your total work time.<br>Perfect for managing time during remote work or study.',
      'timer-title': 'Work Timer',
      'work-title': 'Total Work Time',
      'hour-label': 'Hr',
      'minute-label': 'Min',
      'second-label': 'Sec',
      'clear-title': 'Clear timer setting',
      'btn-start': 'Start',
      'btn-stop': 'Stop',
      'btn-reset': 'Reset',
      'btn-restart': 'Restart',
      'btn-work-start': 'Start Work',
      'btn-work-rest': 'Break',
      'btn-work-reset': 'Reset',
      'btn-work-end': 'End Work',
      'btn-view-log': 'View Work Log',
      'volume-label': 'Volume',
      'footer-title': 'Work Timer',
      'footer-desc': 'A free browser-based tool for tracking your work time.',
      'footer-policy': 'Privacy Policy',
      'modal-title': 'Work Log',
      'close-log': 'Close',

      'status-idle': 'Ready',
      'status-running': 'Running',
      'status-paused': 'Paused',
      'status-resting': 'On Break',
      'status-time-up': 'Time’s Up',

      'status-working': 'Working',

      'rest-label': 'Break Time',
      'no-logs': 'No recorded logs found.',
      'log-ended-at': 'End',
      'log-work-time': 'Work',
      'log-rest-time': 'Break',
      'delete-confirm-label': 'Are you sure you want to delete the log for ',

      'edit-save': 'Save',
      'edit-cancel': 'Cancel',
      'edit-btn-label': 'Edit',
      'aria-edit-btn': 'Edit this log',
      'aria-delete-btn': 'Delete this log',
      'toast-saved': 'Logged successfully!',
      'btn-delete-all': 'Delete All Logs',
      'delete-all-confirm': 'Are you sure you want to delete all work logs?\n(This action cannot be undone)'
    }
  };

  function t(key) {
    return translations[currentLang]?.[key] || translations['ja']?.[key] || key;
  }

  function applyLanguage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const text = t(key);
      if (text.includes('<br>')) {
        el.innerHTML = text;
      } else {
        el.textContent = text;
      }
    });

    document.title = t('title');
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', t('meta-desc'));

    const clearBtn = document.querySelector('[data-timer-clear]');
    if (clearBtn) {
      clearBtn.title = t('clear-title');
      clearBtn.setAttribute('aria-label', t('clear-title'));
    }

    const closeLogBtn = document.querySelector('[data-close-log]');
    if (closeLogBtn) {
      closeLogBtn.setAttribute('aria-label', t('close-log'));
    }

    document.querySelectorAll('[data-preset-seconds]').forEach(btn => {
      const secs = parseInt(btn.getAttribute('data-preset-seconds'), 10);
      if (currentLang === 'ja') {
        if (secs < 60) btn.textContent = `+${secs}秒`;
        else if (secs < 3600) btn.textContent = `+${secs / 60}分`;
        else btn.textContent = `+${secs / 3600}時間`;
      } else {
        if (secs < 60) btn.textContent = `+${secs}s`;
        else if (secs < 3600) btn.textContent = `+${secs / 60}m`;
        else btn.textContent = `+${secs / 3600}h`;
      }
    });

    document.querySelectorAll('[data-lang]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === currentLang);
    });

    updateTimerDisplay();
    updateWorkDisplay();
  }

  const VOLUME_STORAGE_KEY = 'work-timer-volume-v1';
  const MUTE_STORAGE_KEY = 'work-timer-volume-muted-v1';
  const PREMUTE_VOLUME_STORAGE_KEY = 'work-timer-volume-premute-v1';

  let currentVolume = parseFloat(localStorage.getItem(VOLUME_STORAGE_KEY) ?? '0.5');
  let isMuted = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  let preMuteVolume = parseFloat(localStorage.getItem(PREMUTE_VOLUME_STORAGE_KEY) ?? '0.5');

  const volumeSlider = document.querySelector('[data-volume-slider]');
  const volumePercentage = document.querySelector('[data-volume-percentage]');
  const volumeMuteToggle = document.querySelector('[data-volume-mute-toggle]');

  function updateVolumeUI() {
    if (!volumeSlider || !volumePercentage) return;

    if (isMuted) {
      volumeSlider.value = 0;
      volumePercentage.textContent = '0%';
      if (volumeMuteToggle) volumeMuteToggle.classList.add('is-muted');
    } else {
      volumeSlider.value = currentVolume;
      volumePercentage.textContent = `${Math.round(currentVolume * 100)}%`;
      if (volumeMuteToggle) volumeMuteToggle.classList.remove('is-muted');
    }

    const targetVolume = isMuted ? 0 : currentVolume;
    if (buttonAudio) buttonAudio.volume = targetVolume;
    if (alarmAudio) alarmAudio.volume = targetVolume * 0.85;
  }

  if (volumeSlider && volumePercentage) {
    updateVolumeUI();

    volumeSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (val === 0) {
        isMuted = true;
      } else {
        isMuted = false;
        currentVolume = val;
        localStorage.setItem(VOLUME_STORAGE_KEY, String(currentVolume));
      }
      localStorage.setItem(MUTE_STORAGE_KEY, String(isMuted));
      updateVolumeUI();
    });
  }

  if (volumeMuteToggle) {
    volumeMuteToggle.addEventListener('click', () => {
      if (isMuted) {
        isMuted = false;
        if (currentVolume <= 0) {
          currentVolume = preMuteVolume > 0 ? preMuteVolume : 0.5;
        }
      } else {
        isMuted = true;
        if (currentVolume > 0) {
          preMuteVolume = currentVolume;
          localStorage.setItem(PREMUTE_VOLUME_STORAGE_KEY, String(preMuteVolume));
        }
      }
      localStorage.setItem(MUTE_STORAGE_KEY, String(isMuted));
      updateVolumeUI();
    });
  }

  const langBtns = document.querySelectorAll('[data-lang]');
  langBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      currentLang = btn.getAttribute('data-lang');
      localStorage.setItem(LANG_STORAGE_KEY, currentLang);
      applyLanguage();
    });
  });

  function createBeepDataUrl(frequency, duration, volume = 0.75) {
    const sampleRate = 44100;
    const sampleCount = Math.floor(sampleRate * duration);
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + sampleCount * 2);
    const view = new DataView(buffer);

    function writeString(offset, value) {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + sampleCount * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, sampleCount * 2, true);

    for (let index = 0; index < sampleCount; index += 1) {
      const t = index / sampleRate;
      const fadeOut = Math.min(1, (sampleCount - index) / (sampleRate * 0.025));
      const fadeIn = Math.min(1, index / (sampleRate * 0.005));
      const wave = Math.sin(2 * Math.PI * frequency * t);
      const sample = Math.max(-1, Math.min(1, wave * volume * fadeIn * fadeOut));
      view.setInt16(headerSize + index * 2, sample * 32767, true);
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }

    return `data:audio/wav;base64,${btoa(binary)}`;
  }

  function createAlarmClockDataUrl() {
    const sampleRate = 44100;
    const duration = 1;
    const sampleCount = Math.floor(sampleRate * duration);
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + sampleCount * 2);
    const view = new DataView(buffer);
    const pulseWindows = [[0, 0.16], [0.24, 0.40]];

    function writeString(offset, value) {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + sampleCount * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, sampleCount * 2, true);

    for (let index = 0; index < sampleCount; index += 1) {
      const time = index / sampleRate;
      const pulse = pulseWindows.find(([start, end]) => time >= start && time < end);
      let sample = 0;

      if (pulse) {
        const localTime = time - pulse[0];
        const pulseDuration = pulse[1] - pulse[0];
        const attack = Math.min(1, localTime / 0.008);
        const release = Math.min(1, (pulseDuration - localTime) / 0.025);
        const envelope = Math.max(0, Math.min(attack, release));
        const fundamental = Math.sin(2 * Math.PI * 1120 * localTime);
        const harmonic = Math.sin(2 * Math.PI * 2240 * localTime) * 0.22;
        sample = (fundamental + harmonic) * envelope * 0.62;
      }

      view.setInt16(headerSize + index * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }

    return `data:audio/wav;base64,${btoa(binary)}`;
  }

  function getButtonAudio() {
    if (!buttonAudio) {
      buttonAudio = new Audio(createBeepDataUrl(1200, 0.16));
      buttonAudio.preload = 'auto';
      buttonAudio.volume = isMuted ? 0 : currentVolume;
    }

    return buttonAudio;
  }

  function getAlarmAudio() {
    if (!alarmAudio) {
      alarmAudio = new Audio(createAlarmClockDataUrl());
      alarmAudio.preload = 'auto';
      alarmAudio.loop = true;
      alarmAudio.volume = (isMuted ? 0 : currentVolume) * 0.85;
    }

    return alarmAudio;
  }

  function getAlarmController() {
    if (!alarmController) {
      alarmController = createAlarmController(getAlarmAudio());
    }
    return alarmController;
  }

  function isAlarmActive() {
    return Boolean(alarmController?.isActive());
  }

  function playAudioElement(audio) {
    if (!audio) return;

    try {
      audio.pause();
      audio.currentTime = 0;
      audio.play();
    } catch {
      // Some browsers still block media playback; Web Audio remains as fallback.
    }
  }

  function getAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    return audioContext;
  }

  async function unlockAudio() {
    const context = getAudioContext();
    if (!context) return;

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    return context;
  }

  async function playTone(frequency, duration, delay = 0, volume = 0.16) {
    const activeVolume = isMuted ? 0 : currentVolume;
    if (activeVolume <= 0) return;
    const context = await unlockAudio();
    if (!context) return;

    const startAt = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume * activeVolume, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  }

  function shouldSuppressButtonSound() {
    return Date.now() < suppressButtonSoundsUntil;
  }

  function playButtonBeep() {
    if (shouldSuppressButtonSound()) return;
    playTone(1200, 0.1, 0, 0.16);
  }

  function playDoubleBeep() {
    if (shouldSuppressButtonSound()) return;
    playTone(1200, 0.06, 0, 0.16);
    playTone(1200, 0.06, 0.08, 0.16);
  }

  function playStopBeep() {
    playTone(760, 0.08, 0, 0.13);
  }

  function playTimerAlarm() {
    getAlarmController().start();

    if (navigator.vibrate) {
      navigator.vibrate([80, 40, 80, 40, 80]);
    }
  }

  function getConfiguredTimerSeconds() {
    const hours = Math.max(0, Math.floor(Number(timerHours.value) || 0));
    const minutes = Math.max(0, Math.floor(Number(timerMinutes.value) || 0));
    const seconds = Math.max(0, Math.floor(Number(timerSeconds.value) || 0));
    return hours * 3600 + minutes * 60 + seconds;
  }

  function updateConfiguredSeconds() {
    const totalSeconds = getConfiguredTimerSeconds();
    state.lastConfiguredSeconds = totalSeconds;
    saveState(state);
  }

  function updateTimerDisplay() {
    timerDisplay.textContent = formatDuration(timerRemainingSeconds);
    timerStart.disabled = Boolean(timerInterval) || isAlarmActive() || (timerRemainingSeconds <= 0 && getConfiguredTimerSeconds() <= 0);
    timerStop.disabled = !timerInterval && !isAlarmActive();
    
    let statusText = '';
    if (timerInterval) {
      statusText = t('status-running');
    } else {
      if (timerMessage === '待機中') statusText = t('status-idle');
      else if (timerMessage === '停止中') statusText = t('status-paused');
      else if (timerMessage === '時間になりました') statusText = t('status-time-up');
      else statusText = timerMessage;
    }
    timerStatus.textContent = statusText;

    timerStatus.dataset.state = timerInterval ? 'active' : timerMessage === '停止中' ? 'paused' : timerMessage === '時間になりました' ? 'done' : 'idle';
    timerPanel.classList.toggle('is-running', Boolean(timerInterval));
    timerPanel.classList.toggle('is-paused', !timerInterval && timerMessage === '停止中');
    timerPanel.style.borderTopColor = timerInterval 
      ? 'var(--red)' 
      : (timerMessage === '停止中' ? 'var(--blue)' : 'var(--muted)');
  }

  function stopAlarm() {
    if (alarmController) alarmController.stop();
    if (buttonAudio) {
      buttonAudio.pause();
      buttonAudio.currentTime = 0;
    }
    if (navigator.vibrate) {
      navigator.vibrate(0);
    }
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
  }

  function stopAlarmForButtonPress(event) {
    if (!event.target.closest('button')) return;
    const alarmWasActive = isAlarmActive() || timerMessage === '時間になりました';
    if (!alarmWasActive) return;

    suppressButtonSoundsUntil = Date.now() + 500;
    stopAlarm();
  }

  function stopTimer(message = '停止中') {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    stopAlarm();
    timerEndsAt = null;
    timerMessage = message;
    updateTimerDisplay();
  }

  function tickTimer() {
    if (!timerEndsAt) return;
    timerRemainingSeconds = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));

    if (timerRemainingSeconds <= 0) {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      timerEndsAt = null;
      timerMessage = '時間になりました';
      playTimerAlarm();
      updateTimerDisplay();
    } else {
      updateTimerDisplay();
    }
  }

  function startTimer() {
    if (timerRemainingSeconds <= 0) {
      timerRemainingSeconds = getConfiguredTimerSeconds();
    }

    if (timerRemainingSeconds <= 0) return;
    if (timerInterval) clearInterval(timerInterval);

    timerMessage = '計測中';
    timerEndsAt = Date.now() + timerRemainingSeconds * 1000;
    timerInterval = setInterval(tickTimer, 250);
    tickTimer();
  }

  function restartTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerRemainingSeconds = getConfiguredTimerSeconds();
    startTimer();
  }

  function resetTimer() {
    stopAlarm();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    timerEndsAt = null;
    timerRemainingSeconds = getConfiguredTimerSeconds();
    timerMessage = '待機中';
    updateTimerDisplay();
  }

  function clearConfiguredTimer() {
    stopAlarm();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    timerEndsAt = null;
    timerHours.value = 0;
    timerMinutes.value = 0;
    timerSeconds.value = 0;
    timerRemainingSeconds = 0;
    timerMessage = '待機中';
    updateConfiguredSeconds();
    updateTimerDisplay();
  }

  function refreshState() {
    state = restoreRunningSession(state);
    saveState(state);
  }

  function updateWorkDisplay() {
    const today = getTodayKey();
    const displaySeconds = state.currentSession.date === today ? state.currentSession.seconds : 0;
    const restSeconds = state.currentSession.date === today ? (state.currentSession.restSeconds || 0) : 0;

    const statusLabel = {
      working: t('status-working'),
      resting: t('status-resting'),
      idle: t('status-idle')
    }[state.currentSession.status] || t('status-idle');

    const formatted = formatDuration(displaySeconds);
    const parts = formatted.split(':');
    workDisplay.querySelector('[data-work-click="hours"]').textContent = parts[0] || '00';
    workDisplay.querySelector('[data-work-click="minutes"]').textContent = parts[1] || '00';
    workDisplay.querySelector('[data-work-click="seconds"]').textContent = parts[2] || '00';

    const restDisplay = document.querySelector('[data-rest-display]');
    if (restDisplay) restDisplay.textContent = formatDuration(restSeconds);

    workStatus.textContent = statusLabel;
    workStatus.dataset.state = state.currentSession.status;

    workStart.classList.toggle('is-active', state.currentSession.status === 'working');
    workStart.disabled = state.currentSession.status === 'working';
    workRest.classList.toggle('is-active', state.currentSession.status === 'resting');
    workRest.disabled = state.currentSession.status === 'resting';
    workEnd.disabled = displaySeconds === 0 && restSeconds === 0;
    workPanel.classList.toggle('is-running', state.currentSession.status === 'working');
    workPanel.classList.toggle('is-paused', state.currentSession.status === 'resting');
    workPanel.style.borderTopColor = state.currentSession.status === 'working' 
      ? 'var(--red)' 
      : (state.currentSession.status === 'resting' ? 'var(--blue)' : 'var(--muted)');
  }

  function commitState(nextState) {
    state = nextState;
    saveState(state);
    updateWorkDisplay();
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    setTimeout(() => {
      toast.classList.remove('is-visible');
      toast.addEventListener('transitionend', () => toast.remove());
    }, 2000);
  }

  function restartTimerWithSound() {
    stopAlarm();
    suppressButtonSoundsUntil = 0;
    restartTimer();
    playDoubleBeep();
  }

  document.addEventListener('pointerdown', () => {
    unlockAudio();
  }, { once: true, passive: true });

  document.addEventListener('pointerdown', stopAlarmForButtonPress, true);
  document.addEventListener('click', stopAlarmForButtonPress, true);

  timerStart.addEventListener('click', () => { playDoubleBeep(); startTimer(); });
  timerStop.addEventListener('click', () => {
    stopTimer('停止中');
    playStopBeep();
  });
  timerReset.addEventListener('click', resetTimer);
  timerRestart.addEventListener('click', restartTimerWithSound);
  timerClear.addEventListener('click', clearConfiguredTimer);

  for (const input of [timerHours, timerMinutes, timerSeconds]) {
    input.addEventListener('input', () => {
      updateConfiguredSeconds();
      if (!timerInterval) resetTimer();
    });
  }

  for (const button of presetButtons) {
    button.addEventListener('click', () => {
      const presetSeconds = Number(button.dataset.presetSeconds);
      const totalSeconds = addPresetSeconds(getConfiguredTimerSeconds(), presetSeconds);
      timerHours.value = Math.floor(totalSeconds / 3600);
      timerMinutes.value = Math.floor((totalSeconds % 3600) / 60);
      timerSeconds.value = totalSeconds % 60;

      updateConfiguredSeconds();

      if (timerInterval) {
        const updatedRemainingSeconds = addPresetSeconds(timerRemainingSeconds, presetSeconds);
        timerEndsAt += (updatedRemainingSeconds - timerRemainingSeconds) * 1000;
        timerRemainingSeconds = updatedRemainingSeconds;
        updateTimerDisplay();
      } else {
        timerRemainingSeconds = totalSeconds;
        timerMessage = '待機中';
        updateTimerDisplay();
      }
    });
  }

  workStart.addEventListener('click', () => { playDoubleBeep(); commitState(setSessionStatus(state, 'working')); });
  workRest.addEventListener('click', () => { playButtonBeep(); commitState(setSessionStatus(state, 'resting')); });
  workReset.addEventListener('click', () => commitState(resetCurrentSession(state)));
  workEnd.addEventListener('click', () => {
    playButtonBeep();
    const hadSeconds = state.currentSession.seconds > 0 || state.currentSession.restSeconds > 0 || state.currentSession.status === 'working' || state.currentSession.status === 'resting';
    commitState(finalizeToday(state));
    if (hadSeconds) showToast(t('toast-saved'));
  });

  function formatLogDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    if (currentLang === 'ja') {
      const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
      return `${year}/${month}/${day} (${dayOfWeek})`;
    } else {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dayOfWeek = days[date.getDay()];
      const monthName = months[date.getMonth()];
      return `${dayOfWeek}, ${monthName} ${date.getDate()}, ${year}`;
    }
  }

  function formatJapaneseDuration(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    if (safeSeconds === 0) return currentLang === 'ja' ? '0秒' : '0s';
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;
    
    let result = '';
    if (currentLang === 'ja') {
      if (hours > 0) {
        result += `${hours}時間`;
      }
      if (minutes > 0) {
        result += `${minutes}分`;
      }
      if (hours === 0 && minutes === 0 && seconds > 0) {
        result += `${seconds}秒`;
      }
    } else {
      const parts = [];
      if (hours > 0) parts.push(`${hours}h`);
      if (minutes > 0) parts.push(`${minutes}m`);
      if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
      result = parts.join(' ');
    }
    return result;
  }

  let editingLogId = null;

  function renderLogList() {
    logListContainer.innerHTML = '';
    
    const hasRecords = Array.isArray(state.records) && state.records.some(r => r.seconds > 0 || (r.restSeconds || 0) > 0);
    if (deleteAllBtn) {
      deleteAllBtn.disabled = !hasRecords;
    }
 
    if (!Array.isArray(state.records) || state.records.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'log-empty-msg';
      emptyDiv.textContent = t('no-logs');
      logListContainer.appendChild(emptyDiv);
      return;
    }
    
    const sortedRecords = [ ...state.records ]
      .filter(r => r.seconds > 0 || (r.restSeconds || 0) > 0)
      .sort((a, b) => {
        const dateComp = b.date.localeCompare(a.date);
        if (dateComp !== 0) return dateComp;
        return b.id.localeCompare(a.id);
      });
      
      if (sortedRecords.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'log-empty-msg';
        emptyDiv.textContent = t('no-logs');
        logListContainer.appendChild(emptyDiv);
        return;
      }
      
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

    function createEditInput(className, value, max, unitLabel) {
      const field = document.createElement('label');
      field.className = 'log-edit-field';

      const input = document.createElement('input');
      input.type = 'number';
      input.className = className;
      input.min = '0';
      input.max = String(max);
      input.value = value;
      input.setAttribute('aria-label', unitLabel);

      const unit = document.createElement('span');
      unit.textContent = unitLabel;

      field.append(input, unit);
      return field;
    }

    sortedRecords.forEach(record => {
      const isEditing = editingLogId === record.id;
      const itemDiv = document.createElement('div');
      itemDiv.className = `log-item${isEditing ? ' is-editing' : ''}`;

      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'log-item-summary';

      const leftDiv = document.createElement('div');
      leftDiv.className = 'log-item-left';

      const dateSpan = document.createElement('span');
      dateSpan.className = 'log-item-date';
      dateSpan.textContent = formatLogDate(record.date);
      leftDiv.appendChild(dateSpan);

      if (record.endTime) {
        const endTimeSpan = document.createElement('span');
        endTimeSpan.className = 'log-item-endtime';
        endTimeSpan.textContent = `${record.endTime} ${t('log-ended-at')}`;
        leftDiv.appendChild(endTimeSpan);
      }

      const timeGroups = document.createElement('div');
      timeGroups.className = 'log-time-groups log-item-durations';
      timeGroups.append(
        createTimeBlock(
          t('log-work-time'),
          formatJapaneseDuration(record.seconds),
          'log-item-duration-work'
        ),
        createTimeBlock(
          t('log-rest-time'),
          formatJapaneseDuration(record.restSeconds || 0),
          'log-item-duration-rest'
        )
      );

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'log-item-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'log-icon-button edit-log-btn';
      editBtn.dataset.editId = record.id;
      editBtn.setAttribute('aria-label', t('aria-edit-btn'));
      editBtn.title = t('edit-btn-label');
      editBtn.textContent = '✎';
      editBtn.disabled = isEditing;

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'log-icon-button delete-log-btn';
      deleteBtn.dataset.deleteId = record.id;
      deleteBtn.setAttribute('aria-label', t('aria-delete-btn'));
      deleteBtn.title = t('aria-delete-btn');
      deleteBtn.textContent = '×';

      actionsDiv.append(editBtn, deleteBtn);
      summaryDiv.append(leftDiv, timeGroups, actionsDiv);
      itemDiv.appendChild(summaryDiv);

      if (isEditing) {
        const totalSeconds = record.seconds;
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        const restTotalSeconds = record.restSeconds || 0;
        const rh = Math.floor(restTotalSeconds / 3600);
        const rm = Math.floor((restTotalSeconds % 3600) / 60);
        const rs = restTotalSeconds % 60;

        const editForm = document.createElement('div');
        editForm.className = 'log-item-edit-form';

        const fields = document.createElement('div');
        fields.className = 'log-edit-fields';

        const workGroup = document.createElement('div');
        workGroup.className = 'log-edit-group';

        const workLabel = document.createElement('span');
        workLabel.className = 'log-edit-section-label log-item-duration-work';
        workLabel.textContent = t('log-work-time');

        const workInputs = document.createElement('div');
        workInputs.className = 'log-edit-inputs';
        workInputs.append(
          createEditInput('log-edit-hours', h, 99, t('hour-label')),
          createEditInput('log-edit-minutes', m, 59, t('minute-label')),
          createEditInput('log-edit-seconds', s, 59, t('second-label'))
        );
        workGroup.append(workLabel, workInputs);

        const restGroup = document.createElement('div');
        restGroup.className = 'log-edit-group';

        const restLabel = document.createElement('span');
        restLabel.className = 'log-edit-section-label log-item-duration-rest';
        restLabel.textContent = t('log-rest-time');

        const restInputs = document.createElement('div');
        restInputs.className = 'log-edit-inputs';
        restInputs.append(
          createEditInput('log-edit-rest-hours', rh, 99, t('hour-label')),
          createEditInput('log-edit-rest-minutes', rm, 59, t('minute-label')),
          createEditInput('log-edit-rest-seconds', rs, 59, t('second-label'))
        );
        restGroup.append(restLabel, restInputs);
        fields.append(workGroup, restGroup);

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'save-log-btn';
        saveBtn.textContent = t('edit-save');

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'cancel-log-btn';
        cancelBtn.textContent = t('edit-cancel');

        const editActions = document.createElement('div');
        editActions.className = 'log-edit-actions';
        editActions.append(saveBtn, cancelBtn);

        editForm.append(fields, editActions);
        itemDiv.appendChild(editForm);
      }

      logListContainer.appendChild(itemDiv);
    });
  }

  viewLog.addEventListener('click', () => {
    editingLogId = null;
    renderLogList();
    logDialog.showModal();
  });

  closeLog.addEventListener('click', () => {
    editingLogId = null;
    logDialog.close();
  });
 
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', () => {
      if (confirm(t('delete-all-confirm'))) {
        state.records = [];
        saveState(state);
        editingLogId = null;
        renderLogList();
      }
    });
  }

  logListContainer.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-log-btn');
    const deleteBtn = e.target.closest('.delete-log-btn');
    const saveBtn = e.target.closest('.save-log-btn');
    const cancelBtn = e.target.closest('.cancel-log-btn');
    
    if (editBtn) {
      e.stopPropagation();
      editingLogId = editBtn.dataset.editId;
      renderLogList();
      const hInput = logListContainer.querySelector('.log-edit-hours');
      if (hInput) {
        hInput.focus();
        hInput.select();
      }
    } else if (cancelBtn) {
      e.stopPropagation();
      editingLogId = null;
      renderLogList();
    } else if (saveBtn) {
      e.stopPropagation();
      const itemDiv = saveBtn.closest('.log-item');
      const h = Math.max(0, Math.floor(Number(itemDiv.querySelector('.log-edit-hours').value) || 0));
      const m = Math.max(0, Math.min(59, Math.floor(Number(itemDiv.querySelector('.log-edit-minutes').value) || 0)));
      const s = Math.max(0, Math.min(59, Math.floor(Number(itemDiv.querySelector('.log-edit-seconds').value) || 0)));
      const rh = Math.max(0, Math.floor(Number(itemDiv.querySelector('.log-edit-rest-hours').value) || 0));
      const rm = Math.max(0, Math.min(59, Math.floor(Number(itemDiv.querySelector('.log-edit-rest-minutes').value) || 0)));
      const rs = Math.max(0, Math.min(59, Math.floor(Number(itemDiv.querySelector('.log-edit-rest-seconds').value) || 0)));
      
      const newTotal = h * 3600 + m * 60 + s;
      const newRestTotal = rh * 3600 + rm * 60 + rs;
      const record = state.records.find(r => r.id === editingLogId);
      if (record) {
        if (newTotal > 0 || newRestTotal > 0) {
          record.seconds = newTotal;
          record.restSeconds = newRestTotal;
        } else {
          state.records = state.records.filter(r => r.id !== editingLogId);
        }
      }
      
      saveState(state);
      editingLogId = null;
      renderLogList();
    } else if (deleteBtn) {
      e.stopPropagation();
      const idToDelete = deleteBtn.dataset.deleteId;
      const record = state.records.find(r => r.id === idToDelete);
      if (record) {
        const endLabel = t('log-ended-at');
        const timeLabel = record.endTime ? ` (${record.endTime} ${endLabel})` : '';
        const msg = currentLang === 'ja'
          ? `${formatLogDate(record.date)}${timeLabel} ${t('delete-confirm-label')}`
          : `${t('delete-confirm-label')}${formatLogDate(record.date)}${timeLabel}?`;
        if (confirm(msg)) {
          state.records = state.records.filter(r => r.id !== idToDelete);
          saveState(state);
          editingLogId = null;
          renderLogList();
        }
      }
    }
  });

  logDialog.addEventListener('click', (e) => {
    if (e.target === logDialog) {
      editingLogId = null;
      logDialog.close();
    }
  });

  workDisplay.addEventListener('click', (e) => {
    const targetClick = e.target.closest('[data-work-click]');
    const targetUnit = targetClick ? targetClick.dataset.workClick : 'hours';

    workDisplay.classList.add('hidden');
    workEditContainer.classList.remove('hidden');

    const hh = workDisplay.querySelector('[data-work-click="hours"]').textContent;
    const mm = workDisplay.querySelector('[data-work-click="minutes"]').textContent;
    const ss = workDisplay.querySelector('[data-work-click="seconds"]').textContent;

    workEditHours.value = hh;
    workEditMinutes.value = mm;
    workEditSeconds.value = ss;

    if (targetUnit === 'hours') {
      workEditHours.focus();
      workEditHours.select();
    } else if (targetUnit === 'minutes') {
      workEditMinutes.focus();
      workEditMinutes.select();
    } else if (targetUnit === 'seconds') {
      workEditSeconds.focus();
      workEditSeconds.select();
    }
  });

  let isSavingEditedWorkTime = false;

  function saveEditedWorkTime() {
    if (isSavingEditedWorkTime) return;
    isSavingEditedWorkTime = true;

    const hours = Math.max(0, Math.floor(Number(workEditHours.value) || 0));
    const minutes = Math.max(0, Math.min(59, Math.floor(Number(workEditMinutes.value) || 0)));
    const seconds = Math.max(0, Math.min(59, Math.floor(Number(workEditSeconds.value) || 0)));
    const newTotal = hours * 3600 + minutes * 60 + seconds;

    const today = getTodayKey();
    if (state.currentSession.status === 'idle') {
      const todayRecords = state.records.filter(r => r.date === today);
      if (todayRecords.length > 0) {
        const latestRecord = todayRecords.sort((a, b) => b.id.localeCompare(a.id))[0];
        if (newTotal > 0) {
          latestRecord.seconds = newTotal;
        } else {
          state.records = state.records.filter(r => r.id !== latestRecord.id);
        }
      } else if (newTotal > 0) {
        const nowMs = Date.now();
        const endClock = new Date(nowMs);
        const hh = String(endClock.getHours()).padStart(2, '0');
        const mm = String(endClock.getMinutes()).padStart(2, '0');
        state.records.push({
          id: String(nowMs),
          date: today,
          endTime: `${hh}:${mm}`,
          seconds: newTotal
        });
      }
      state.currentSession.seconds = 0;
    } else {
      state.currentSession.seconds = newTotal;
      state.currentSession.lastUpdatedAt = Date.now();
    }

    saveState(state);
    updateWorkDisplay();

    workEditContainer.classList.add('hidden');
    workDisplay.classList.remove('hidden');
    isSavingEditedWorkTime = false;
  }

  function handleGlobalBlur() {
    setTimeout(() => {
      const activeEl = document.activeElement;
      if (activeEl !== workEditHours && activeEl !== workEditMinutes && activeEl !== workEditSeconds) {
        saveEditedWorkTime();
      }
    }, 40);
  }

  for (const input of [workEditHours, workEditMinutes, workEditSeconds]) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveEditedWorkTime();
      } else if (e.key === 'Escape') {
        workEditContainer.classList.add('hidden');
        workDisplay.classList.remove('hidden');
      }
    });

    input.addEventListener('blur', handleGlobalBlur);
    input.addEventListener('focus', () => {
      input.select();
    });

    input.addEventListener('input', () => {
      const valStr = String(input.value);
      if (valStr.length >= 2) {
        if (input === workEditHours) {
          workEditMinutes.focus();
          workEditMinutes.select();
        } else if (input === workEditMinutes) {
          workEditSeconds.focus();
          workEditSeconds.select();
        }
      }
    });
  }

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshState();
      updateWorkDisplay();
    }
  });

  setInterval(() => {
    refreshState();
    updateWorkDisplay();
  }, 1000);

  resetTimer();
  updateWorkDisplay();
  applyLanguage();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', setupApp);
}
