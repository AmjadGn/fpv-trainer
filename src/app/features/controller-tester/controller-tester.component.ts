import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';

import { FLIGHT_CHANNELS } from '../../core/controller/models/controller-calibration.model';
import { ControllerCalibrationService } from '../../core/controller/services/controller-calibration.service';
import { GamepadControllerService } from '../../core/controller/services/gamepad-controller.service';
import { AppShellService } from '../../core/shell/app-shell.service';

@Component({
  selector: 'app-controller-tester',
  imports: [DecimalPipe],
  templateUrl: './controller-tester.component.html',
  styleUrl: './controller-tester.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControllerTesterComponent {
  protected readonly controller = inject(GamepadControllerService);
  protected readonly calibration = inject(ControllerCalibrationService);
  private readonly shell = inject(AppShellService);

  protected readonly channels = FLIGHT_CHANNELS;

  protected readonly connectionStatus = computed(() => {
    if (!this.controller.apiAvailable()) {
      return 'unavailable' as const;
    }

    return this.controller.connected()
      ? ('connected' as const)
      : ('waiting' as const);
  });

  protected readonly connectionLabel = computed(() => {
    switch (this.connectionStatus()) {
      case 'connected':
        return 'Connected';
      case 'unavailable':
        return 'Gamepad API unavailable';
      default:
        return 'Waiting for controller';
    }
  });

  protected readonly calibrationLabel = computed(() =>
    this.calibration.hasCalibration() ? 'Calibrated' : 'Not calibrated',
  );

  protected readonly diagnosticsJson = computed(() =>
    JSON.stringify(
      {
        connected: this.controller.connected(),
        controllerName: this.controller.controllerName(),
        controllerIndex: this.controller.controllerIndex(),
        mapping: this.controller.mapping(),
        axes: this.controller.axes(),
        buttons: this.controller.buttons(),
        lastUpdated: this.controller.lastUpdated(),
        apiAvailable: this.controller.apiAvailable(),
        calibration: this.calibration.calibration(),
        calibratedInput: this.calibration.calibratedInput(),
      },
      null,
      2,
    ),
  );

  protected axisFillPercent(rawValue: number): number {
    return ((rawValue + 1) / 2) * 100;
  }

  protected channelLabel(channel: string): string {
    return channel.charAt(0).toUpperCase() + channel.slice(1);
  }

  protected onScanControllers(): void {
    this.controller.scanControllers();
  }

  protected onOpenCalibration(): void {
    this.calibration.openWelcomeOrComplete();
    this.shell.showCalibration();
  }

  protected onResetCalibration(): void {
    const confirmed = window.confirm(
      'Reset controller calibration? This cannot be undone.',
    );
    if (confirmed) {
      this.calibration.resetCalibration();
    }
  }
}
