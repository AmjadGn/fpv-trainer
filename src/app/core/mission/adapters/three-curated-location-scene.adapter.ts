import {
  BoxGeometry,
  Color,
  Fog,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Material,
  type BufferGeometry,
  type Texture,
} from 'three';
import type { QualityTier } from '@fpv/location-domain';

import { COASTAL_RUINS_LAYOUT } from '../../../content/locations/mediterranean-expedition-region/layout';
import { MEDITERRANEAN_PERFORMANCE_BUDGETS } from '../../../content/locations/mediterranean-expedition-region/presentation';
import { SeededRandom, mixSeed } from '../../environment/utils/seeded-random';

export interface CuratedLocationVisualHandle {
  readonly root: Group;
  readonly landmarkGroupNames: readonly string[];
  readonly diagnostics: LocationVisualDiagnostics;
}

export interface LocationVisualDiagnostics {
  readonly visualObjectCount: number;
  readonly geometryCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly qualityTier: QualityTier;
  readonly authoredSeed: number;
}

/**
 * Builds deterministic proxy-quality Coastal Ruins visuals.
 * Quality tiers change decorative density only — not landmark/spawn/collision layout.
 */
export class ThreeCuratedLocationSceneAdapter {
  private geometries: BufferGeometry[] = [];
  private materials: Material[] = [];
  private textures: Texture[] = [];
  private activeRoot: Group | null = null;

  build(
    qualityTier: QualityTier = 'medium',
  ): CuratedLocationVisualHandle {
    this.disposeInternal();
    const L = COASTAL_RUINS_LAYOUT;
    const root = new Group();
    root.name = 'curated-mediterranean-expedition-region';

    const landmarks = new Group();
    landmarks.name = 'landmarks';
    root.add(landmarks);

    const terrainMat = this.trackMaterial(
      new MeshStandardMaterial({
        color: new Color(0x6b7a5a),
        roughness: 0.92,
        metalness: 0.02,
      }),
    );
    const stoneMat = this.trackMaterial(
      new MeshStandardMaterial({
        color: new Color(0x9a9080),
        roughness: 0.88,
        metalness: 0.04,
      }),
    );
    const cliffMat = this.trackMaterial(
      new MeshStandardMaterial({
        color: new Color(0x7a6e5c),
        roughness: 0.9,
        metalness: 0.03,
      }),
    );
    const seaMat = this.trackMaterial(
      new MeshStandardMaterial({
        color: new Color(0x2a6a88),
        roughness: 0.55,
        metalness: 0.1,
      }),
    );

    // Terrain plane
    const terrainGeo = this.trackGeometry(
      new PlaneGeometry(
        L.terrain.halfExtents.x * 2,
        L.terrain.halfExtents.z * 2,
        qualityTier === 'high' ? 32 : qualityTier === 'medium' ? 16 : 8,
        qualityTier === 'high' ? 32 : qualityTier === 'medium' ? 16 : 8,
      ),
    );
    const terrain = new Mesh(terrainGeo, terrainMat);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.set(L.terrain.position.x, 0, L.terrain.position.z);
    terrain.name = 'terrain-visual';
    root.add(terrain);

    // Sea plane (visual only)
    const seaGeo = this.trackGeometry(new PlaneGeometry(140, 80));
    const sea = new Mesh(seaGeo, seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.4, -70);
    sea.name = 'sea-visual';
    root.add(sea);

    // Cliff
    const cliff = this.boxMesh(
      'landmark-cliff',
      cliffMat,
      L.cliff.center.x,
      L.cliff.center.y,
      L.cliff.center.z,
      L.cliff.lengthX,
      L.cliff.heightY,
      L.cliff.depthZ,
    );
    landmarks.add(cliff);

    // Stone arch (visual pillars + lintel — opening clear)
    const archGroup = new Group();
    archGroup.name = 'landmark-stone-sea-arch';
    const arch = L.stoneArch;
    const pillarHalfX = (arch.outerHalfExtents.x - arch.openingHalfExtents.x) / 2;
    const pillarXOffset = arch.openingHalfExtents.x + pillarHalfX;
    archGroup.add(
      this.boxMesh(
        'arch-pillar-l',
        stoneMat,
        arch.position.x - pillarXOffset,
        arch.outerHalfExtents.y,
        arch.position.z,
        pillarHalfX * 2,
        arch.outerHalfExtents.y * 2,
        arch.outerHalfExtents.z * 2,
      ),
    );
    archGroup.add(
      this.boxMesh(
        'arch-pillar-r',
        stoneMat,
        arch.position.x + pillarXOffset,
        arch.outerHalfExtents.y,
        arch.position.z,
        pillarHalfX * 2,
        arch.outerHalfExtents.y * 2,
        arch.outerHalfExtents.z * 2,
      ),
    );
    archGroup.add(
      this.boxMesh(
        'arch-lintel',
        stoneMat,
        arch.position.x,
        arch.outerHalfExtents.y * 2 - 0.6,
        arch.position.z,
        arch.outerHalfExtents.x * 2,
        1.2,
        arch.outerHalfExtents.z * 2,
      ),
    );
    landmarks.add(archGroup);

    // Lookout tower
    const towerGroup = new Group();
    towerGroup.name = 'landmark-ruined-lookout';
    const tower = L.lookoutTower;
    towerGroup.add(
      this.boxMesh(
        'tower-base',
        stoneMat,
        tower.position.x,
        tower.baseHalfExtents.y,
        tower.position.z,
        tower.baseHalfExtents.x * 2,
        tower.baseHalfExtents.y * 2,
        tower.baseHalfExtents.z * 2,
      ),
    );
    towerGroup.add(
      this.boxMesh(
        'tower-shaft',
        stoneMat,
        tower.position.x,
        tower.shaftCenterY,
        tower.position.z,
        tower.shaftHalfExtents.x * 2,
        tower.shaftHalfExtents.y * 2,
        tower.shaftHalfExtents.z * 2,
      ),
    );
    landmarks.add(towerGroup);

    // Cliffside ruin
    const cliffRuinGroup = new Group();
    cliffRuinGroup.name = 'landmark-cliffside-ruin';
    const cr = L.cliffsideRuin;
    cliffRuinGroup.add(
      this.boxMesh(
        'cliffside-wall',
        stoneMat,
        cr.position.x,
        cr.position.y + cr.wallHalfExtents.y,
        cr.position.z,
        cr.wallHalfExtents.x * 2,
        cr.wallHalfExtents.y * 2,
        cr.wallHalfExtents.z * 2,
      ),
    );
    landmarks.add(cliffRuinGroup);

    // Ruined walls
    const wallsGroup = new Group();
    wallsGroup.name = 'landmark-ruined-walls';
    L.walls.forEach((wall, i) => {
      wallsGroup.add(
        this.boxMesh(
          `wall-${i}`,
          stoneMat,
          wall.position.x,
          wall.position.y,
          wall.position.z,
          wall.halfExtents.x * 2,
          wall.halfExtents.y * 2,
          wall.halfExtents.z * 2,
        ),
      );
    });
    landmarks.add(wallsGroup);

    // Rock passage
    const passage = new Group();
    passage.name = 'landmark-rock-passage';
    passage.add(
      this.boxMesh(
        'passage-left',
        cliffMat,
        L.rockPassage.left.position.x,
        L.rockPassage.left.position.y,
        L.rockPassage.left.position.z,
        L.rockPassage.left.halfExtents.x * 2,
        L.rockPassage.left.halfExtents.y * 2,
        L.rockPassage.left.halfExtents.z * 2,
      ),
    );
    passage.add(
      this.boxMesh(
        'passage-right',
        cliffMat,
        L.rockPassage.right.position.x,
        L.rockPassage.right.position.y,
        L.rockPassage.right.position.z,
        L.rockPassage.right.halfExtents.x * 2,
        L.rockPassage.right.halfExtents.y * 2,
        L.rockPassage.right.halfExtents.z * 2,
      ),
    );
    landmarks.add(passage);

    // Major rocks
    const rocks = new Group();
    rocks.name = 'landmark-major-rocks';
    L.majorRocks.forEach((rock, i) => {
      rocks.add(
        this.boxMesh(
          `major-rock-${i}`,
          cliffMat,
          rock.position.x,
          rock.position.y,
          rock.position.z,
          rock.halfExtents.x * 2,
          rock.halfExtents.y * 2,
          rock.halfExtents.z * 2,
        ),
      );
    });
    landmarks.add(rocks);

    // Elevated vantage marker (visual)
    const vantage = this.boxMesh(
      'landmark-elevated-vantage',
      stoneMat,
      L.elevatedVantage.position.x,
      L.elevatedVantage.position.y,
      L.elevatedVantage.position.z,
      3,
      0.4,
      3,
    );
    landmarks.add(vantage);

    // Decorative rocks — density by quality tier only
    const decorCount = MEDITERRANEAN_PERFORMANCE_BUDGETS[qualityTier].decorativeRockCount;
    const rng = new SeededRandom(mixSeed(L.authoredSeed, 0xdec0));
    const decor = new Group();
    decor.name = 'decorative-rocks';
    for (let i = 0; i < decorCount; i++) {
      const x = rng.range(-55, 55);
      const z = rng.range(-75, 35);
      const s = rng.range(0.4, 1.4);
      decor.add(
        this.boxMesh(
          `decor-rock-${i}`,
          cliffMat,
          x,
          s * 0.5,
          z,
          s,
          s,
          s * rng.range(0.7, 1.2),
        ),
      );
    }
    root.add(decor);

    const landmarkGroupNames = landmarks.children.map((c) => c.name);
    this.activeRoot = root;

    const diagnostics: LocationVisualDiagnostics = {
      visualObjectCount: this.countMeshes(root),
      geometryCount: this.geometries.length,
      materialCount: this.materials.length,
      textureCount: this.textures.length,
      qualityTier,
      authoredSeed: L.authoredSeed,
    };

    return {
      root,
      landmarkGroupNames,
      diagnostics,
    };
  }

  dispose(handle?: CuratedLocationVisualHandle): void {
    if (handle?.root) {
      handle.root.removeFromParent();
    }
    if (this.activeRoot) {
      this.activeRoot.removeFromParent();
      this.activeRoot = null;
    }
    this.disposeInternal();
  }

  getActiveRoot(): Group | null {
    return this.activeRoot;
  }

  private boxMesh(
    name: string,
    material: Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ): Mesh {
    const geo = this.trackGeometry(new BoxGeometry(w, h, d));
    const mesh = new Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private trackGeometry<T extends BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private trackMaterial<T extends Material>(mat: T): T {
    this.materials.push(mat);
    return mat;
  }

  private disposeInternal(): void {
    for (const g of this.geometries) {
      g.dispose();
    }
    for (const m of this.materials) {
      m.dispose();
    }
    for (const t of this.textures) {
      t.dispose();
    }
    this.geometries = [];
    this.materials = [];
    this.textures = [];
  }

  private countMeshes(root: Group): number {
    let n = 0;
    root.traverse((obj) => {
      if ((obj as Mesh).isMesh) {
        n += 1;
      }
    });
    return n;
  }
}

/** Optional fog color helper for Mediterranean sky. */
export function mediterraneanFog(): Fog {
  return new Fog(0xc8d4e0, 60, 220);
}
