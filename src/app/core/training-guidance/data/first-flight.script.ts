import type { GuidanceScript } from '../models/guidance-step.model';

/** Short first-flight tutorial (~3–7 minutes). Competitive-safe = never. */
export const FIRST_FLIGHT_SCRIPT: GuidanceScript = {
  id: 'first-flight-v1',
  version: 1,
  title: 'First Flight',
  competitiveSafe: false,
  steps: [
    {
      id: 'arm',
      title: 'Arm your aircraft',
      body: 'Press Arm (or Space on keyboard) when you are ready. Crashing is normal — you can reset anytime.',
      trigger: { type: 'manual' },
      actions: [{ type: 'show-text', text: 'Arm to begin' }, { type: 'show-control-visualization' }],
    },
    {
      id: 'throttle',
      title: 'Add throttle',
      body: 'Gently raise throttle until the aircraft lifts. Small inputs work best.',
      trigger: { type: 'throttle-threshold', value: 0.25 },
      actions: [{ type: 'show-text', text: 'Raise throttle slowly' }],
    },
    {
      id: 'hover',
      title: 'Hold a hover',
      body: 'Try to stay level a few meters above the ground. Training assistance is on.',
      trigger: { type: 'altitude-reached', value: 1.5 },
      actions: [{ type: 'show-text', text: 'Hold altitude' }, { type: 'highlight-hud', target: 'altitude' }],
    },
    {
      id: 'yaw',
      title: 'Look left and right',
      body: 'Use yaw to turn in place without moving forward.',
      trigger: { type: 'yaw-movement', value: 0.35 },
      actions: [{ type: 'show-text', text: 'Practice yaw' }],
    },
    {
      id: 'roll',
      title: 'Bank left and right',
      body: 'Roll tilts the aircraft sideways. Ease back to center to straighten out.',
      trigger: { type: 'roll-movement', value: 0.3 },
      actions: [{ type: 'show-text', text: 'Practice roll' }],
    },
    {
      id: 'pitch',
      title: 'Move forward',
      body: 'Pitch forward to fly ahead. Keep throttle steady.',
      trigger: { type: 'pitch-movement', value: 0.3 },
      actions: [{ type: 'show-text', text: 'Pitch forward' }],
    },
    {
      id: 'gate',
      title: 'Fly through the gate',
      body: 'Pass through the large training gate ahead. Take your time.',
      trigger: { type: 'gate-passed' },
      actions: [
        { type: 'show-text', text: 'Fly through the gate' },
        { type: 'show-directional-marker', target: 'training-gate' },
      ],
    },
    {
      id: 'finish',
      title: 'Nice work',
      body: 'You completed your first guided flight. Learn, Fly, and Compete are waiting on the dashboard.',
      trigger: { type: 'manual' },
      actions: [{ type: 'show-text', text: 'Tutorial complete' }, { type: 'advance-step' }],
    },
  ],
};
