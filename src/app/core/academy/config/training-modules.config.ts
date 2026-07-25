import type { TrainingModuleDefinition } from '../models/training-module.models';

const ENV = 'alpine-training-valley';
const IDENTITY_YAW = { x: 0, y: 0, z: 0, w: 1 };
const RATE_PROFILES = ['beginner', 'normal', 'acro'];

/**
 * Catalog of Training Academy modules.
 * Keep unlockRequirements empty for early-tester friendliness unless gated intentionally.
 */
export const TRAINING_MODULES: TrainingModuleDefinition[] = [
  {
    id: 'hover-control',
    version: 1,
    title: 'Hover Control',
    description:
      'Hold a steady hover inside a cylindrical target zone above the valley floor.',
    objective:
      'Stay inside the target cylinder for 20 cumulative seconds with minimal drift.',
    difficulty: 'beginner',
    estimatedDurationSeconds: 90,
    environmentId: ENV,
    spawnPose: {
      position: { x: 0, y: 1.2, z: -8 },
      orientation: IDENTITY_YAW,
    },
    allowedRateProfiles: RATE_PROFILES,
    recommendedRateProfile: 'normal',
    recommendedAircraftIds: ['aeroguard-2', 'nano-scout'],
    evaluatorType: 'hover',
    evaluatorConfig: {
      holdSeconds: 20,
      radius: 1.2,
      targetHeight: 3,
      center: { x: 0, y: 3, z: -12 },
      briefExitGraceSeconds: 1.5,
      crashPenalty: 15,
    },
    successCriteria: [
      'Accumulate 20 seconds inside the hover cylinder',
      'Keep altitude near the target height',
      'Avoid crashes during the hold',
    ],
    medalThresholds: { bronze: 50, silver: 70, gold: 88 },
    unlockRequirements: {},
    instructionalSteps: [
      {
        id: 'hover-brief',
        title: 'Find the marker',
        instruction:
          'Climb gently to the glowing hover marker ahead and level out.',
        completionHint: 'You are near the target when the HUD ring turns green.',
        illustrationType: 'hover-zone',
        targetMarker: 'hover-center',
      },
      {
        id: 'hover-hold',
        title: 'Hold steady',
        instruction:
          'Use small stick inputs. Brief exits bleed progress slowly — re-enter quickly.',
        completionHint: 'Fill the hold meter without hard resets.',
        illustrationType: 'hold-meter',
      },
      {
        id: 'hover-finish',
        title: 'Complete the hold',
        instruction: 'Keep the craft stable until the evaluator confirms success.',
        completionHint: 'Success triggers when cumulative inside time reaches 20s.',
      },
    ],
    tips: [
      'Center throttle around hover — chase altitude with tiny inputs.',
      'Look at the horizon line to catch drift early.',
      'If you exit the cylinder, ease back in instead of yanking sticks.',
    ],
    supportsGhost: false,
    enabled: true,
  },
  {
    id: 'precision-landing',
    version: 1,
    title: 'Precision Landing',
    description:
      'Approach a landing pad and touch down softly inside the circle.',
    objective:
      'Land on the pad with controlled vertical speed, attitude, and confirm time.',
    difficulty: 'beginner',
    estimatedDurationSeconds: 60,
    environmentId: ENV,
    spawnPose: {
      position: { x: 0, y: 4, z: -8 },
      orientation: IDENTITY_YAW,
    },
    allowedRateProfiles: RATE_PROFILES,
    recommendedRateProfile: 'normal',
    evaluatorType: 'landing',
    evaluatorConfig: {
      padCenter: { x: 8, y: 0, z: -20 },
      padRadius: 1.5,
      maxVerticalSpeed: 1.2,
      maxImpactSpeed: 2.5,
      maxTiltRadians: 0.45,
      confirmSeconds: 0.6,
      crashFails: true,
    },
    successCriteria: [
      'Touch down inside the pad radius',
      'Keep vertical and total speed within limits',
      'Hold a stable attitude for the confirm window',
    ],
    medalThresholds: { bronze: 55, silver: 75, gold: 90 },
    unlockRequirements: {},
    instructionalSteps: [
      {
        id: 'landing-approach',
        title: 'Line up',
        instruction: 'Fly toward the pad and bleed altitude early.',
        completionHint: 'Stay above the pad center as you descend.',
        illustrationType: 'landing-pad',
        targetMarker: 'landing-pad',
      },
      {
        id: 'landing-flare',
        title: 'Flare soft',
        instruction:
          'Reduce vertical speed before contact. Hard impacts fail the attempt.',
        completionHint: 'Touchdown should feel cushioned, not slammed.',
      },
      {
        id: 'landing-confirm',
        title: 'Confirm settled',
        instruction: 'Stay planted and level for a short confirm window.',
        completionHint: 'Do not bounce or tip after contact.',
      },
    ],
    tips: [
      'Square the craft before the final descent.',
      'Watch vertical speed more than forward speed near the pad.',
      'A crash anywhere ends the attempt immediately.',
    ],
    supportsGhost: false,
    enabled: true,
  },
  {
    id: 'gate-basics',
    version: 1,
    title: 'Gate Basics',
    description:
      'Fly a short four-gate line and learn clean opening passes.',
    objective: 'Complete all four gates in order through the valid openings.',
    difficulty: 'beginner',
    estimatedDurationSeconds: 120,
    environmentId: ENV,
    spawnPose: {
      position: { x: 0, y: 1.2, z: 4 },
      orientation: IDENTITY_YAW,
    },
    allowedRateProfiles: RATE_PROFILES,
    recommendedRateProfile: 'normal',
    recommendedAircraftIds: ['aeroguard-2', 'nano-scout', 'flux-f5'],
    evaluatorType: 'gateCourse',
    evaluatorConfig: {
      courseId: 'training-gate-basics',
      gateCount: 4,
    },
    successCriteria: [
      'Pass all four gates in sequence',
      'Prefer center openings over edge scrapes',
      'Finish the line without excessive misses',
    ],
    medalThresholds: { bronze: 50, silver: 70, gold: 88 },
    unlockRequirements: {},
    instructionalSteps: [
      {
        id: 'gate-lineup',
        title: 'Pick a line',
        instruction: 'Aim for gate centers — width is generous on purpose.',
        completionHint: 'The next gate highlights when you are on course.',
        illustrationType: 'gate',
        targetMarker: 'next-gate',
      },
      {
        id: 'gate-pass',
        title: 'Pass clean',
        instruction:
          'Fly through the opening. Outside-plane crosses count as misses.',
        completionHint: 'Valid opening required — frame hits do not advance.',
      },
      {
        id: 'gate-finish',
        title: 'Finish the line',
        instruction: 'Complete gate 4 to finish the drill.',
        completionHint: 'Finish event awards the result.',
      },
    ],
    tips: [
      'Throttle ahead of the gate, then hold through the opening.',
      'Misses cost score but you can continue the sequence.',
      'Ghost replay is available after a clean completion.',
    ],
    supportsGhost: true,
    enabled: true,
  },
  {
    id: 'figure-eight',
    version: 1,
    title: 'Figure Eight',
    description:
      'Trace a figure-eight around left and right markers with center returns.',
    objective:
      'Complete two full cycles: center → left → center → right → …',
    difficulty: 'intermediate',
    estimatedDurationSeconds: 150,
    environmentId: ENV,
    spawnPose: {
      position: { x: 0, y: 2, z: -22 },
      orientation: IDENTITY_YAW,
    },
    allowedRateProfiles: RATE_PROFILES,
    recommendedRateProfile: 'normal',
    recommendedAircraftIds: ['flux-f5', 'apex-r5'],
    evaluatorType: 'figureEight',
    evaluatorConfig: {
      center: { x: 0, y: 2, z: -30 },
      leftMarker: { x: -8, y: 2, z: -30 },
      rightMarker: { x: 8, y: 2, z: -30 },
      checkpointRadius: 3,
      requiredCycles: 2,
    },
    successCriteria: [
      'Hit checkpoints in the correct order',
      'Complete two full figure-eight cycles',
      'Keep motion smooth between markers',
    ],
    medalThresholds: { bronze: 55, silver: 72, gold: 90 },
    // Prefer unlocked for early testers — avoid frustration gates.
    unlockRequirements: {},
    instructionalSteps: [
      {
        id: 'fig8-center',
        title: 'Acquire center',
        instruction: 'Start by flying through the center checkpoint.',
        completionHint: 'Center lights when acquired.',
        illustrationType: 'checkpoint',
        targetMarker: 'fig8-center',
      },
      {
        id: 'fig8-left',
        title: 'Left loop',
        instruction: 'From center, arc left around the left marker, then return.',
        completionHint: 'Wrong order softly resets to the last valid checkpoint.',
        targetMarker: 'fig8-left',
      },
      {
        id: 'fig8-right',
        title: 'Right loop',
        instruction:
          'From center again, arc right around the right marker and return.',
        completionHint: 'Two full cycles complete the module.',
        targetMarker: 'fig8-right',
      },
    ],
    tips: [
      'Think of an ∞ laid flat — center is the crossing point.',
      'Smooth yaw + bank beats sharp stick punches.',
      'If sequence resets, reacquire the highlighted checkpoint calmly.',
    ],
    supportsGhost: false,
    enabled: true,
  },
  {
    id: 'crosswind-fundamentals',
    version: 1,
    title: 'Crosswind Fundamentals',
    description:
      'Learn to compensate for a steady lateral wind: hover, fly gates, then land.',
    objective:
      'Hold a hover under crosswind, pass three aligned gates, and land on the pad.',
    difficulty: 'beginner',
    estimatedDurationSeconds: 180,
    environmentId: ENV,
    spawnPose: {
      position: { x: 0, y: 1.2, z: 2 },
      orientation: IDENTITY_YAW,
    },
    allowedRateProfiles: RATE_PROFILES,
    recommendedRateProfile: 'normal',
    recommendedAircraftIds: ['horizon-l7', 'aeroguard-2'],
    evaluatorType: 'crosswind',
    evaluatorConfig: {
      weatherPresetId: 'crosswind',
      hoverCenter: { x: 0, y: 3, z: -8 },
      hoverRadius: 1.5,
      hoverHoldSeconds: 8,
      gateCount: 3,
      padCenter: { x: 0, y: 0, z: -48 },
      padRadius: 1.8,
      crashPenalty: 12,
    },
    successCriteria: [
      'Hold the hover zone under lateral wind',
      'Complete three aligned gates',
      'Land accurately on the pad',
    ],
    medalThresholds: { bronze: 50, silver: 70, gold: 88 },
    unlockRequirements: {},
    instructionalSteps: [
      {
        id: 'cw-brief',
        title: 'Read the wind',
        instruction:
          'Wind pushes from the right. Watch the HUD arrow and windsock before takeoff.',
        completionHint: 'Arm when ready — compensate with opposite stick.',
        illustrationType: 'wind',
      },
      {
        id: 'cw-hover',
        title: 'Hover against drift',
        instruction: 'Hold inside the hover cylinder while fighting lateral drift.',
        completionHint: 'Fill the hold meter before the gate line unlocks.',
        illustrationType: 'hover-zone',
        targetMarker: 'hover-center',
      },
      {
        id: 'cw-gates',
        title: 'Gate line',
        instruction: 'Fly three aligned gates. Keep correcting for crosswind.',
        completionHint: 'Each clean pass advances the line.',
        illustrationType: 'gate',
      },
      {
        id: 'cw-land',
        title: 'Land on target',
        instruction: 'Settle onto the pad with controlled speed.',
        completionHint: 'Hold contact briefly to confirm.',
        illustrationType: 'landing-pad',
      },
    ],
    tips: [
      'Feed a little opposite roll/yaw to cancel drift — then re-center.',
      'Gusts are mild in this drill; focus on steady compensation.',
      'Use the wind HUD arrow as your primary reference.',
    ],
    supportsGhost: false,
    enabled: true,
  },
];

export function getTrainingModuleById(
  id: string,
): TrainingModuleDefinition | undefined {
  return TRAINING_MODULES.find((module) => module.id === id);
}
