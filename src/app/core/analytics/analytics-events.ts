/** Typed product analytics event names for the alpha funnel. */
export const AnalyticsEvents = {
  appOpened: 'app_opened',
  appReady: 'app_ready',
  unsupportedBrowserDetected: 'unsupported_browser_detected',
  offlineModeEntered: 'offline_mode_entered',

  onboardingStarted: 'onboarding_started',
  onboardingStepViewed: 'onboarding_step_viewed',
  onboardingStepCompleted: 'onboarding_step_completed',
  onboardingSkipped: 'onboarding_skipped',
  onboardingCompleted: 'onboarding_completed',

  controlMethodSelected: 'control_method_selected',
  controllerDetected: 'controller_detected',
  controllerCalibrationStarted: 'controller_calibration_started',
  controllerCalibrationCompleted: 'controller_calibration_completed',
  controllerCalibrationFailed: 'controller_calibration_failed',
  controllerDisconnected: 'controller_disconnected',

  hangarOpened: 'hangar_opened',
  aircraftViewed: 'aircraft_viewed',
  aircraftSelected: 'aircraft_selected',
  aircraftCompared: 'aircraft_compared',
  testFlightStarted: 'test_flight_started',

  flightSetupStarted: 'flight_setup_started',
  flightStarted: 'flight_started',
  flightLoaded: 'flight_loaded',
  flightLoadFailed: 'flight_load_failed',
  flightCompleted: 'flight_completed',
  flightExited: 'flight_exited',
  flightCrashed: 'flight_crashed',
  aircraftReset: 'aircraft_reset',
  pauseOpened: 'pause_opened',

  lessonStarted: 'lesson_started',
  lessonStepCompleted: 'lesson_step_completed',
  lessonFailed: 'lesson_failed',
  lessonCompleted: 'lesson_completed',
  assistanceEnabled: 'assistance_enabled',
  firstHoverSucceeded: 'first_hover_succeeded',
  firstGatePassed: 'first_gate_passed',

  raceStarted: 'race_started',
  raceCompleted: 'race_completed',
  raceAbandoned: 'race_abandoned',
  ghostEnabled: 'ghost_enabled',
  leaderboardSubmissionAttempted: 'leaderboard_submission_attempted',
  leaderboardSubmissionSucceeded: 'leaderboard_submission_succeeded',
  leaderboardSubmissionFailed: 'leaderboard_submission_failed',

  accountPromptViewed: 'account_prompt_viewed',
  accountCreated: 'account_created',
  loginCompleted: 'login_completed',
  feedbackOpened: 'feedback_opened',
  feedbackSubmitted: 'feedback_submitted',
  performanceWarningTriggered: 'performance_warning_triggered',

  dashboardEntered: 'dashboard_entered',
  continuePromptShown: 'continue_prompt_shown',
  continueAccepted: 'continue_accepted',
} as const;

export type AnalyticsEventName =
  (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];
