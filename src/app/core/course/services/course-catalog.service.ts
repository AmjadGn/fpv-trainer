import { Injectable } from '@angular/core';

import { COASTAL_RUN } from '../config/coastal-run.course';
import { STARTER_CIRCUIT } from '../config/default-course';
import { INDUSTRIAL_SPRINT } from '../config/industrial-sprint.course';
import type { Course } from '../models/course.model';

export interface CourseCatalogEntry {
  course: Course | null;
  id: string;
  name: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  environmentId: string;
  gateCount: number;
  comingSoon: boolean;
  playable: boolean;
}

export const COURSE_CATALOG: CourseCatalogEntry[] = [
  {
    course: STARTER_CIRCUIT,
    id: STARTER_CIRCUIT.id,
    name: STARTER_CIRCUIT.name,
    description: STARTER_CIRCUIT.description,
    difficulty: 'beginner',
    environmentId: 'alpine-training-valley',
    gateCount: STARTER_CIRCUIT.gates.length,
    comingSoon: false,
    playable: true,
  },
  {
    course: null,
    id: 'mountain-descent',
    name: 'Mountain Descent',
    description: 'High-speed alpine descent with elevation changes.',
    difficulty: 'advanced',
    environmentId: 'alpine-training-valley',
    gateCount: 0,
    comingSoon: true,
    playable: false,
  },
  {
    course: INDUSTRIAL_SPRINT,
    id: INDUSTRIAL_SPRINT.id,
    name: INDUSTRIAL_SPRINT.name,
    description: INDUSTRIAL_SPRINT.description,
    difficulty: 'intermediate',
    environmentId: 'desert-industrial-yard',
    gateCount: INDUSTRIAL_SPRINT.gates.length,
    comingSoon: false,
    playable: true,
  },
  {
    course: COASTAL_RUN,
    id: COASTAL_RUN.id,
    name: COASTAL_RUN.name,
    description: COASTAL_RUN.description,
    difficulty: 'intermediate',
    environmentId: 'coastal-ruins',
    gateCount: COASTAL_RUN.gates.length,
    comingSoon: false,
    playable: true,
  },
];

@Injectable({ providedIn: 'root' })
export class CourseCatalogService {
  list(): CourseCatalogEntry[] {
    return COURSE_CATALOG;
  }

  getPlayable(courseId: string): Course | null {
    const entry = COURSE_CATALOG.find((c) => c.id === courseId);
    if (!entry || !entry.playable || !entry.course) {
      return null;
    }
    return entry.course;
  }
}
