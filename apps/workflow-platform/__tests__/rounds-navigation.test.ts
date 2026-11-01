import { describe, expect, it } from 'vitest';
import { availableRoundsTabs } from '../../../modules/operator-rounds/web/src/rounds-navigation';

describe('Operator Rounds role navigation', () => {
  it('opens the board for a board-only supervisor without exposing route setup', () => {
    expect(availableRoundsTabs(['operator-rounds.board.read'])).toEqual(['board']);
  });

  it('offers exception review independently of route administration', () => {
    expect(availableRoundsTabs(['operator-rounds.exceptions.read'])).toEqual(['exceptions']);
  });

  it('shows no Rounds work when the session has no Rounds permission', () => {
    expect(availableRoundsTabs(['cmms.work-orders.read'])).toEqual([]);
  });

  it('offers all workspaces to a module administrator', () => {
    expect(availableRoundsTabs(['operator-rounds:*'])).toEqual(['routes','board','exceptions']);
  });
});
