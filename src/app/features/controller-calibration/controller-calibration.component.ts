import { DecimalPipe, PercentPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';

import {
  FLIGHT_CHANNELS,
  FlightChannel,
} from '../../core/controller/models/controller-calibration.model';
import { ControllerCalibrationService } from '../../core/controller/services/controller-calibration.service';
import { GamepadControllerService } from '../../core/controller/services/gamepad-controller.service';
import { AppShellService } from '../../core/shell/app-shell.service';

@Component({
  selector: 'app-controller-calibration',
  imports: [DecimalPipe, PercentPipe],
  templateUrl: './controller-calibration.component.html',
  styleUrl: './controller-calibration.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControllerCalibrationComponent {
  protected readonly controller = inject(GamepadControllerService);
  protected readonly calibration = inject(ControllerCalibrationService);
  private readonly shell = inject(AppShellService);

  protected readonly channels = FLIGHT_CHANNELS;

  protected readonly step = computed(() => this.calibration.activeStep());
  protected readonly isIdentifyStep = computed(() =>
    this.step().startsWith('identify-'),
  );

  protected readonly statusLabel = computed(() => {
    switch (this.calibration.calibrationStatus()) {
      case 'calibrated':
        return 'Calibrated';
      case 'calibrating':
        return 'Calibrating';
      case 'error':
        return 'Error';
      default:
        return 'Not calibrated';
    }
  });

  protected axisFillPercent(rawValue: number): number {
    return ((rawValue + 1) / 2) * 100;
  }

  protected channelFillPercent(channel: FlightChannel, value: number): number {
    if (channel === 'throttle') {
      return value * 100;
    }
    return ((value + 1) / 2) * 100;
  }

  protected channelLabel(channel: FlightChannel): string {
    return channel.charAt(0).toUpperCase() + channel.slice(1);
  }

  protected isChannelInverted(channel: FlightChannel): boolean {
    if (this.step() === 'complete') {
      return this.calibration.calibration()?.channels[channel]?.inverted ?? false;
    }
    return this.calibration.draftInversions()[channel];
  }

  protected onStart(): void {
    this.calibration.startCalibration();
  }

  protected onContinueCenter(): void {
    this.calibration.continueFromCenter();
  }

  protected onAcceptAxis(): void {
    this.calibration.acceptDetectedAxis();
  }

  protected onRepeat(): void {
    this.calibration.repeatStep();
  }

  protected onFinishRange(): void {
    this.calibration.finishRangeCapture();
  }

  protected onToggleInvert(channel: FlightChannel): void {
    this.calibration.toggleInvert(channel);
  }

  protected onSave(): void {
    this.calibration.saveCalibration();
  }

  protected onRecalibrate(): void {
    this.calibration.startCalibration();
  }

  protected onReset(): void {
    const confirmed = window.confirm(
      'Reset controller calibration? This cannot be undone.',
    );
    if (confirmed) {
      this.calibration.resetCalibration();
    }
  }

  protected onCancel(): void {
    this.calibration.cancelCalibration();
  }

  protected onBackToDiagnostics(): void {
    this.calibration.openWelcomeOrComplete();
    this.shell.showDiagnostics();
  }

  protected onScan(): void {
    this.controller.scanControllers();
  }
}
