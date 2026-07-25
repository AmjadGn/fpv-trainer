import { TournamentApiService } from './tournament-api.service';

describe('TournamentApiService', () => {
  it('keeps practice and ranked attempt modes explicit', () => {
    expect(TournamentApiService.attemptPayload('practice')).toEqual({ mode: 'practice' });
    expect(TournamentApiService.attemptPayload('ranked')).toEqual({ mode: 'ranked' });
  });
});
