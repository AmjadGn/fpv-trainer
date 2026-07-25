import { ShareCardService } from './share-card.service';

describe('ShareCardService', () => {
  it('creates social and story sized canvases with verified/local labels', () => {
    const service = new ShareCardService();
    const landscape = service.create({
      title: 'Pilot',
      course: 'Starter Circuit',
      time: '00:42.000',
      rank: 1,
      verified: true,
    });
    expect(landscape.width).toBe(1200);
    expect(landscape.height).toBe(630);

    const portrait = service.create({
      title: 'Pilot',
      course: 'Starter Circuit',
      verified: false,
      portrait: true,
    });
    expect(portrait.width).toBe(1080);
    expect(portrait.height).toBe(1920);
  });
});
