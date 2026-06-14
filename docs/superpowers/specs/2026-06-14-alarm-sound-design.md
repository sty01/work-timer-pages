# Alarm Sound Design

## Goal

Make the timer completion sound immediately recognizable as an alarm clock while preserving instant stop behavior.

## Behavior

- The alarm uses a repeating two-beep pattern: two short high tones followed by a short pause.
- The pattern is rendered as one looping WAV audio source so stopping remains synchronous and reliable.
- Pressing Stop pauses and rewinds the alarm before any confirmation sound plays.
- Stop then plays one short, lower confirmation beep.
- The alarm and confirmation beep follow the existing volume and mute controls.
- Other timer and work controls keep their current sounds.

## Verification

- Confirm the generated alarm WAV contains two audible pulses and a silent gap.
- Confirm Stop pauses and rewinds the alarm immediately.
- Confirm Stop plays exactly one confirmation beep after the alarm has stopped.
- Confirm delayed audio playback cannot restart the alarm after Stop.
- Run the existing automated tests and verify the deployed Cloudflare Pages URL.
