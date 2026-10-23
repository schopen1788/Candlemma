import { describe, expect, it } from 'vitest';
import { directionRanges } from '../../web/src/lib/judging';

describe('question threshold labels shared by practice and ranking', () => {
  it('shows the exact half-percent boundary and inclusive flat range', () => {
    expect(directionRanges(0.5)).toEqual({ up: '+0.5% 초과', flat: '−0.5%~+0.5%', down: '−0.5% 미만' });
  });
  it('uses historical questions own thresholds instead of the new default', () => {
    expect(directionRanges(2)).toEqual({ up: '+2.0% 초과', flat: '−2.0%~+2.0%', down: '−2.0% 미만' });
  });
});
