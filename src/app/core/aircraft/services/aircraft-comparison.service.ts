import { Injectable, inject } from '@angular/core';

import type { AircraftDefinition } from '../models/aircraft-definition.model';
import type { AircraftNormalizedStats } from '../models/aircraft-stats.model';
import { AircraftCatalogService } from './aircraft-catalog.service';
import { AircraftStatsService } from './aircraft-stats.service';

export interface AircraftComparisonRow {
  key: string;
  label: string;
  values: Array<string | number>;
  /** Index of highest numeric value, or -1. */
  higherIndex: number;
  /** Index of lowest numeric value, or -1. */
  lowerIndex: number;
  majorDifference: boolean;
}

export interface AircraftComparisonResult {
  aircraft: AircraftDefinition[];
  stats: AircraftNormalizedStats[];
  rows: AircraftComparisonRow[];
  notice: string;
}

@Injectable({ providedIn: 'root' })
export class AircraftComparisonService {
  private readonly catalog = inject(AircraftCatalogService);
  private readonly stats = inject(AircraftStatsService);

  compare(ids: string[]): AircraftComparisonResult {
    const unique = [...new Set(ids)].slice(0, 3);
    const aircraft = unique
      .map((id) => this.catalog.getById(id))
      .filter((a): a is AircraftDefinition => !!a);
    const stats = aircraft.map((a) => this.stats.derive(a));

    const rows: AircraftComparisonRow[] = [
      this.textRow('category', 'Category', aircraft.map((a) => a.category)),
      this.numRow(
        'mass',
        'Takeoff mass (kg)',
        aircraft.map((a) => a.takeoffMassKg),
        false,
      ),
      this.numRow(
        'frame',
        'Frame size (m)',
        aircraft.map((a) => a.wheelbaseMeters),
        false,
      ),
      this.numRow(
        'prop',
        'Propeller (m)',
        aircraft.map((a) => a.propellerDiameterMeters),
        false,
      ),
      this.numRow(
        'topSpeed',
        'Top speed (sim)',
        stats.map((s) => Math.round(s.speed)),
        true,
      ),
      this.numRow(
        'accel',
        'Acceleration',
        stats.map((s) => Math.round(s.acceleration)),
        true,
      ),
      this.numRow(
        'agility',
        'Agility',
        stats.map((s) => Math.round(s.agility)),
        true,
      ),
      this.numRow(
        'stability',
        'Stability',
        stats.map((s) => Math.round(s.stability)),
        true,
      ),
      this.numRow(
        'wind',
        'Wind resistance',
        stats.map((s) => Math.round(s.windResistance)),
        true,
      ),
      this.numRow(
        'cam',
        'Camera angle (°)',
        aircraft.map((a) => a.cameraProfile.fpv.cameraAngleDeg),
        false,
      ),
      this.textRow(
        'use',
        'Recommended use',
        aircraft.map((a) => a.recommendedModes.join(', ')),
      ),
      this.numRow(
        'diff',
        'Difficulty',
        aircraft.map((a) => a.difficulty),
        false,
      ),
    ];

    return {
      aircraft,
      stats,
      rows,
      notice:
        'Comparison highlights tradeoffs. No aircraft is objectively better for every mission.',
    };
  }

  private textRow(
    key: string,
    label: string,
    values: string[],
  ): AircraftComparisonRow {
    return {
      key,
      label,
      values,
      higherIndex: -1,
      lowerIndex: -1,
      majorDifference: false,
    };
  }

  private numRow(
    key: string,
    label: string,
    values: number[],
    highlightExtremes: boolean,
  ): AircraftComparisonRow {
    let higherIndex = -1;
    let lowerIndex = -1;
    let max = -Infinity;
    let min = Infinity;
    values.forEach((v, i) => {
      if (v > max) {
        max = v;
        higherIndex = i;
      }
      if (v < min) {
        min = v;
        lowerIndex = i;
      }
    });
    const span = max - min;
    const majorDifference =
      highlightExtremes && values.length > 1 && span >= 15;
    return {
      key,
      label,
      values: values.map((v) =>
        Number.isInteger(v) ? v : Math.round(v * 100) / 100,
      ),
      higherIndex: highlightExtremes ? higherIndex : -1,
      lowerIndex: highlightExtremes ? lowerIndex : -1,
      majorDifference,
    };
  }
}
