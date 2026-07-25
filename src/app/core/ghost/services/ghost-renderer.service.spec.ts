import { Scene } from 'three';
import { GhostRendererService } from './ghost-renderer.service';

describe('GhostRendererService', () => {
  it('limits visible ghosts while retaining all ghost handles', () => {
    const scene = new Scene();
    const service = new GhostRendererService();
    service.attach(scene);
    service.upsertGhost('benchmark', 'benchmark');
    service.upsertGhost('pb', 'personal_best');
    service.upsertGhost('rival', 'rival');
    service.setGhostVisible('benchmark', true);
    service.setGhostVisible('pb', true);
    service.setGhostVisible('rival', true);

    expect(scene.children.filter((child) => child.visible)).toHaveLength(2);
    service.setMaxVisible(4);
    service.setGhostVisible('rival', true);
    expect(scene.children.filter((child) => child.visible)).toHaveLength(3);
  });
});
