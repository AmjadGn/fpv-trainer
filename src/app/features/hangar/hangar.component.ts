import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';

import { AircraftCatalogService } from '../../core/aircraft/services/aircraft-catalog.service';
import { AircraftComparisonService } from '../../core/aircraft/services/aircraft-comparison.service';
import { AircraftPersistenceService } from '../../core/aircraft/services/aircraft-persistence.service';
import { AircraftStatsService } from '../../core/aircraft/services/aircraft-stats.service';
import { SelectedAircraftService } from '../../core/aircraft/services/selected-aircraft.service';
import { createAircraftVisual, disposeAircraftVisual, type AircraftVisualResult } from '../../core/aircraft/factories/aircraft-visual.factory';
import type { AircraftDefinition } from '../../core/aircraft/models/aircraft-definition.model';
import type { AircraftCategory } from '../../core/aircraft/models/aircraft-definition.model';
import type { AircraftId } from '../../core/aircraft/models/aircraft-ids';
import { AIRCRAFT_STATS_DISCLAIMER } from '../../core/aircraft/models/aircraft-stats.model';
import { AppShellService } from '../../core/shell/app-shell.service';
import { DroneBuilderFacadeService } from '../drone-builder/services/drone-builder-facade.service';
import type { FactoryAircraftId } from '@fpv/factory-aircraft';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';
import { FpvDialogComponent } from '../../shared/ui/fpv-dialog.component';
import { ComponentPresentationMediaService } from '../drone-builder/services/component-presentation-media.service';
import { HangarLibraryService } from './services/hangar-library.service';
import type {
  HangarCompiledCardView,
  HangarDraftCardView,
} from './models/hangar-library.models';

@Component({
  selector: 'app-hangar',
  standalone: true,
  imports: [DecimalPipe, FpvButtonDirective, FpvDialogComponent],
  templateUrl: './hangar.component.html',
  styleUrl: './hangar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HangarComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly catalog = inject(AircraftCatalogService);
  protected readonly selected = inject(SelectedAircraftService);
  private readonly stats = inject(AircraftStatsService);
  private readonly comparison = inject(AircraftComparisonService);
  private readonly persistence = inject(AircraftPersistenceService);
  private readonly shell = inject(AppShellService);
  private readonly builderFacade = inject(DroneBuilderFacadeService);
  protected readonly hangarLibrary = inject(HangarLibraryService);
  private readonly media = inject(ComponentPresentationMediaService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly canvasHost = viewChild.required<ElementRef<HTMLElement>>('hangarCanvas');

  protected readonly query = signal('');
  protected readonly categoryFilter = signal<AircraftCategory | 'all'>('all');
  protected readonly favoritesOnly = signal(false);
  protected readonly compareIds = signal<AircraftId[]>([]);
  protected readonly showCompare = signal(false);
  protected readonly loadingModel = signal(false);
  protected readonly autoRotate = signal(this.persistence.load().hangarAutoRotate);
  protected readonly reducedMotion = signal(false);
  protected readonly focusIndex = signal(0);
  protected readonly disclaimer = AIRCRAFT_STATS_DISCLAIMER;

  // Checkpoint 4 — Hangar library state (drafts + compiled user builds).
  protected readonly libraryState = this.hangarLibrary.state;
  protected readonly draftCards = this.hangarLibrary.draftCards;
  protected readonly compiledCards = this.hangarLibrary.compiledCards;
  protected readonly recoveryNotice = this.hangarLibrary.recoveryNotice;
  protected readonly libraryError = this.hangarLibrary.errorMessage;
  protected readonly libraryNotice = this.hangarLibrary.actionNotice;
  protected readonly storageUnavailable = computed(() =>
    this.hangarLibrary.isStorageUnavailable(),
  );
  protected readonly storageMessage = computed(() =>
    this.hangarLibrary.storageMessage(),
  );
  protected readonly draftsEmpty = computed(() => this.draftCards().length === 0);
  protected readonly compiledEmpty = computed(() => this.compiledCards().length === 0);

  protected readonly deleteDraftTarget = signal<HangarDraftCardView | null>(null);
  protected readonly deleteCompiledTarget = signal<HangarCompiledCardView | null>(
    null,
  );
  protected readonly renameDraftTarget = signal<HangarDraftCardView | null>(null);
  protected readonly renameDraftName = signal('');

  protected readonly filtered = computed(() =>
    this.catalog.filter({
      query: this.query(),
      category: this.categoryFilter(),
      favoritesOnly: this.favoritesOnly(),
      favoriteIds: this.selected.favoriteIds(),
      includeUserBuilds: false,
    }),
  );

  protected readonly previewDef = computed(() => {
    const list = this.filtered();
    const id = this.selected.selectedAircraftId();
    return list.find((a) => a.id === id) ?? list[0] ?? this.catalog.require(id);
  });

  protected readonly previewStats = computed(() =>
    this.stats.derive(this.previewDef()),
  );

  protected readonly comparisonResult = computed(() =>
    this.comparison.compare(this.compareIds()),
  );

  protected readonly categories = computed(() => this.catalog.categories());

  private renderer: WebGLRenderer | null = null;
  private scene: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private aircraftGroup: Group | null = null;
  private currentVisual: AircraftVisualResult | null = null;
  private rafId: number | null = null;
  private dragging = false;
  private lastX = 0;
  private yaw = 0.4;
  private distance = 3.2;
  private targetDistance = 3.2;
  private disposed = false;
  private preferReducedMotion = false;

  ngOnInit(): void {
    void this.hangarLibrary.refresh();
  }

  ngAfterViewInit(): void {
    this.preferReducedMotion =
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.reducedMotion.set(this.preferReducedMotion);
    if (this.preferReducedMotion) {
      this.autoRotate.set(false);
    }
    this.initScene();
    void this.loadPreview(this.previewDef());
    this.loop();

    this.destroyRef.onDestroy(() => this.dispose());
  }

  ngOnDestroy(): void {
    this.dispose();
  }

  protected onSearch(value: string): void {
    this.query.set(value);
  }

  protected onCategory(value: string): void {
    this.categoryFilter.set(value as AircraftCategory | 'all');
  }

  protected selectAircraft(def: AircraftDefinition): void {
    this.selected.select(def.id);
    void this.loadPreview(def);
  }

  protected toggleFavorite(id: AircraftId, event: Event): void {
    event.stopPropagation();
    this.selected.toggleFavorite(id);
  }

  protected isFavorite(id: AircraftId): boolean {
    return this.selected.isFavorite(id);
  }

  protected toggleCompare(id: AircraftId): void {
    const cur = this.compareIds();
    if (cur.includes(id)) {
      this.compareIds.set(cur.filter((x) => x !== id));
      return;
    }
    if (cur.length >= 3) {
      this.compareIds.set([...cur.slice(1), id]);
      return;
    }
    this.compareIds.set([...cur, id]);
  }

  protected openCompare(): void {
    if (this.compareIds().length < 2) {
      const id = this.previewDef().id;
      if (!this.compareIds().includes(id)) {
        this.compareIds.set([...this.compareIds(), id].slice(0, 3));
      }
    }
    this.showCompare.set(true);
  }

  protected closeCompare(): void {
    this.showCompare.set(false);
  }

  protected setLivery(liveryId: string): void {
    this.selected.setLivery(this.previewDef().id, liveryId);
    void this.loadPreview(this.previewDef());
  }

  protected resetCamera(): void {
    this.yaw = 0.4;
    this.targetDistance = 3.2;
    this.distance = 3.2;
  }

  protected toggleAutoRotate(): void {
    if (this.preferReducedMotion) {
      this.autoRotate.set(false);
      return;
    }
    const next = !this.autoRotate();
    this.autoRotate.set(next);
    this.persistence.setHangerPrefs({ hangarAutoRotate: next });
  }

  protected selectAndClose(): void {
    this.selected.select(this.previewDef().id);
  }

  /** Keep the details panel focused on the current factory craft (Inspect). */
  protected inspectFactory(): void {
    this.selectAircraft(this.previewDef());
    this.canvasHost()?.nativeElement?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }

  protected startTestFlight(): void {
    const id = this.selected.select(this.previewDef().id);
    this.dispose();
    this.shell.showFlight({ kind: 'test-flight', aircraftId: id });
  }

  protected startFullFlight(): void {
    const id = this.selected.select(this.previewDef().id);
    this.dispose();
    this.shell.showFlight({ kind: 'free', aircraftId: id });
  }

  protected openBuilder(): void {
    this.dispose();
    this.shell.showBuilder();
  }

  protected customizeInBuilder(): void {
    const craft = this.previewDef();
    if (!craft.tags.includes('user-build')) {
      this.builderFacade.duplicateFactoryAircraft(
        craft.id as FactoryAircraftId,
        `${craft.displayName} (Custom)`,
      );
    }
    this.dispose();
    this.shell.showBuilder();
  }

  // ---------------------------------------------------------------------
  // Checkpoint 4 — User Build Drafts actions
  // ---------------------------------------------------------------------

  protected openDraft(card: HangarDraftCardView): void {
    this.dispose();
    void this.hangarLibrary.openDraftInBuilder(card.buildId);
  }

  /** Jump to compiled revisions for this draft (same Hangar page section). */
  protected viewDraftRevisions(card: HangarDraftCardView): void {
    const first = this.compiledCards().find((c) => c.buildId === card.buildId);
    const el = document.getElementById(
      first ? `compiled-${first.revisionId}` : 'hangar-compiled-section',
    );
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (first) {
      el?.classList.add('hangar__compiled-card--highlight');
      window.setTimeout(
        () => el?.classList.remove('hangar__compiled-card--highlight'),
        1600,
      );
    }
  }

  protected duplicateDraft(card: HangarDraftCardView): void {
    void this.hangarLibrary.duplicateDraft(card.buildId);
  }

  protected requestRenameDraft(card: HangarDraftCardView, event?: Event): void {
    event?.stopPropagation();
    this.renameDraftTarget.set(card);
    this.renameDraftName.set(card.name);
  }

  protected onRenameInput(value: string): void {
    this.renameDraftName.set(value);
  }

  protected confirmRenameDraft(): void {
    const target = this.renameDraftTarget();
    if (!target) return;
    const name = this.renameDraftName();
    this.renameDraftTarget.set(null);
    void this.hangarLibrary.renameDraft(target.buildId, name);
  }

  protected cancelRenameDraft(): void {
    this.renameDraftTarget.set(null);
  }

  protected requestDeleteDraft(card: HangarDraftCardView, event?: Event): void {
    event?.stopPropagation();
    this.deleteDraftTarget.set(card);
  }

  protected confirmDeleteDraft(): void {
    const target = this.deleteDraftTarget();
    if (!target) return;
    this.deleteDraftTarget.set(null);
    void this.hangarLibrary.deleteDraft(target.buildId);
  }

  protected cancelDeleteDraft(): void {
    this.deleteDraftTarget.set(null);
  }

  protected compileDraft(card: HangarDraftCardView): void {
    void this.hangarLibrary.compileDraftFromHangar(card.buildId);
  }

  protected compileAndFlyDraft(card: HangarDraftCardView): void {
    this.dispose();
    void this.hangarLibrary.compileAndFlyDraft(card.buildId);
  }

  // ---------------------------------------------------------------------
  // Checkpoint 4 — Compiled User Aircraft actions
  // ---------------------------------------------------------------------

  protected selectCompiled(card: HangarCompiledCardView): void {
    if (!card.isFlyable) {
      return;
    }
    this.selected.trySelectExact(card.aircraftId);
  }

  protected inspectCompiled(card: HangarCompiledCardView): void {
    this.selectCompiled(card);
    const el = document.getElementById(`compiled-${card.revisionId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  protected flyCompiled(card: HangarCompiledCardView): void {
    this.dispose();
    this.hangarLibrary.flyCompiled(card.revisionId);
  }

  protected duplicateCompiledIntoBuilder(card: HangarCompiledCardView): void {
    this.dispose();
    void this.hangarLibrary.duplicateCompiledSourceIntoBuilder(card.revisionId);
  }

  protected requestDeleteCompiled(
    card: HangarCompiledCardView,
    event?: Event,
  ): void {
    event?.stopPropagation();
    this.deleteCompiledTarget.set(card);
  }

  protected confirmDeleteCompiled(): void {
    const target = this.deleteCompiledTarget();
    if (!target) return;
    this.deleteCompiledTarget.set(null);
    void this.hangarLibrary.deleteCompiledRevision(target.revisionId);
  }

  protected cancelDeleteCompiled(): void {
    this.deleteCompiledTarget.set(null);
  }

  protected dismissLibraryNotice(): void {
    this.hangarLibrary.clearActionNotice();
  }

  protected onMediaError(event: Event): void {
    this.media.onImageError(event, 'frame');
  }

  protected onKeyNav(event: KeyboardEvent): void {
    const list = this.filtered();
    if (!list.length) {
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      const next = (this.focusIndex() + 1) % list.length;
      this.focusIndex.set(next);
      this.selectAircraft(list[next]);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const next = (this.focusIndex() - 1 + list.length) % list.length;
      this.focusIndex.set(next);
      this.selectAircraft(list[next]);
    } else if (event.key === 'Enter') {
      this.selectAndClose();
    }
  }

  protected onPointerDown(event: PointerEvent): void {
    this.dragging = true;
    this.lastX = event.clientX;
    this.autoRotate.set(false);
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.dragging) {
      return;
    }
    const dx = event.clientX - this.lastX;
    this.lastX = event.clientX;
    this.yaw += dx * 0.01;
  }

  protected onPointerUp(): void {
    this.dragging = false;
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.targetDistance = Math.min(
      6,
      Math.max(1.6, this.targetDistance + event.deltaY * 0.002),
    );
  }

  protected statEntries(): Array<{ key: string; label: string; value: number }> {
    const s = this.previewStats();
    return [
      { key: 'speed', label: 'Speed', value: s.speed },
      { key: 'accel', label: 'Acceleration', value: s.acceleration },
      { key: 'agility', label: 'Agility', value: s.agility },
      { key: 'stability', label: 'Stability', value: s.stability },
      { key: 'wind', label: 'Wind resistance', value: s.windResistance },
      { key: 'glide', label: 'Glide', value: s.glide },
      { key: 'protect', label: 'Collision protection', value: s.collisionProtection },
      { key: 'beginner', label: 'Beginner friendliness', value: s.beginnerFriendliness },
    ];
  }

  protected categoryLabel(cat: string): string {
    return cat.replace(/-/g, ' ');
  }

  private async loadPreview(def: AircraftDefinition): Promise<void> {
    if (!this.scene) {
      return;
    }
    this.loadingModel.set(true);
    await Promise.resolve();
    if (this.disposed) {
      return;
    }

    if (this.currentVisual) {
      disposeAircraftVisual(this.currentVisual);
      this.currentVisual = null;
    }
    if (this.aircraftGroup) {
      this.scene.remove(this.aircraftGroup);
      this.aircraftGroup = null;
    }

    try {
      const visual = createAircraftVisual(def, {
        shadows: true,
        lod: 'full',
        liveryId: this.selected.preferredLiveryId(),
      });
      this.currentVisual = visual;
      this.aircraftGroup = visual.group;
      this.aircraftGroup.position.y = 0.15;
      this.scene.add(this.aircraftGroup);
      const framing = def.cameraProfile.replay.hangarFraming;
      this.targetDistance = Math.max(1.8, framing + 0.8);
    } catch {
      // fallback already handled inside factory path
    } finally {
      this.loadingModel.set(false);
    }
  }

  private initScene(): void {
    const host = this.canvasHost().nativeElement;
    const scene = new Scene();
    scene.background = new Color(0x0a1016);
    scene.fog = new Fog(0x0a1016, 6, 18);

    const camera = new PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.set(2.4, 1.6, 3.2);

    const renderer = new WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const hemi = new HemisphereLight(0xb8d4e8, 0x1a222c, 0.55);
    scene.add(hemi);
    const key = new DirectionalLight(0xffffff, 1.1);
    key.position.set(3, 5, 2);
    scene.add(key);
    const rim = new DirectionalLight(0x2ec4b6, 0.45);
    rim.position.set(-3, 2, -2);
    scene.add(rim);
    scene.add(new AmbientLight(0x406070, 0.25));

    const floor = new Mesh(
      new PlaneGeometry(12, 12),
      new MeshStandardMaterial({
        color: 0x121a22,
        metalness: 0.35,
        roughness: 0.45,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new GridHelper(10, 20, 0x2a3a48, 0x1a2834);
    grid.position.y = 0.01;
    scene.add(grid);

    const stand = new Mesh(
      new PlaneGeometry(0.9, 0.9),
      new MeshStandardMaterial({ color: 0x1a2430, metalness: 0.5, roughness: 0.4 }),
    );
    stand.rotation.x = -Math.PI / 2;
    stand.position.y = 0.02;
    scene.add(stand);

    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    const onResize = (): void => {
      if (!this.renderer || !this.camera) {
        return;
      }
      const w = host.clientWidth;
      const h = Math.max(1, host.clientHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => window.removeEventListener('resize', onResize));
    onResize();
  }

  private loop = (): void => {
    if (this.disposed || !this.renderer || !this.scene || !this.camera) {
      return;
    }
    if (this.autoRotate() && !this.dragging && !this.preferReducedMotion) {
      this.yaw += 0.004;
    }
    this.distance += (this.targetDistance - this.distance) * 0.12;
    if (this.aircraftGroup) {
      this.aircraftGroup.rotation.y = this.yaw;
    }
    this.camera.position.set(
      Math.sin(this.yaw * 0.15) * this.distance * 0.35 + this.distance * 0.55,
      this.distance * 0.42,
      this.distance * 0.85,
    );
    this.camera.lookAt(0, 0.2, 0);
    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this.loop);
  };

  private dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.currentVisual) {
      disposeAircraftVisual(this.currentVisual);
      this.currentVisual = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
      this.renderer = null;
    }
    this.scene = null;
    this.camera = null;
    this.aircraftGroup = null;
  }
}
