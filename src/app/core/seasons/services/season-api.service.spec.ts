import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { SeasonApiService } from './season-api.service';

describe('SeasonApiService', () => {
  it('loads the current season endpoint', () => {
    const get = vi.fn(() => of({ name: 'Summer' }));
    TestBed.configureTestingModule({
      providers: [SeasonApiService, { provide: HttpClient, useValue: { get } }],
    });

    TestBed.inject(SeasonApiService).current().subscribe();

    expect(get).toHaveBeenCalledWith(expect.stringContaining('/seasons/current'));
  });
});
