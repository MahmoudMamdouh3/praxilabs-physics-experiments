import { describe, it, expect } from 'vitest';
import { buildFriendlyCsvContent } from '../src/core/ui/exportHelpers.ts';

describe('buildFriendlyCsvContent', () => {
  it('creates a readable CSV export with experiment metadata and measurement rows', () => {
    const content = buildFriendlyCsvContent(
      [{ time: 1, angle: 20 }, { time: 2, angle: 15 }],
      'Simple Pendulum',
      { length: 2, gravity: 9.81 },
    );

    expect(content).toContain('Experiment Name');
    expect(content).toContain('Simple Pendulum');
    expect(content).toContain('Measurement History');
    expect(content).toContain('Step,Measurement,Value');
    expect(content).toContain('time,1');
    expect(content).toContain('angle,20');
  });
});
