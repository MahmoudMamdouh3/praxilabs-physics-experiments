export function buildFriendlyCsvContent(
  measurementHistory: Array<Record<string, number>>,
  experimentName: string,
  parameters: Record<string, number>,
): string {
  const rows: string[] = [];
  rows.push('Experiment Name,' + experimentName);
  rows.push('Parameters,' + Object.entries(parameters).map(([k, v]) => `${k}=${v}`).join('; '));
  rows.push('Recorded Samples,' + measurementHistory.length);
  rows.push('');
  rows.push('Measurement History');
  rows.push('Step,Measurement,Value');

  measurementHistory.forEach((row, index) => {
    for (const [key, value] of Object.entries(row)) {
      rows.push(`${index + 1},${key},${Number(value).toFixed(6)}`);
    }
  });

  if (measurementHistory.length > 0) {
    const lastRow = measurementHistory[measurementHistory.length - 1];
    rows.push('');
    rows.push('Summary,Last Sample,');
    for (const [key, value] of Object.entries(lastRow)) {
      rows.push(`,${key},${Number(value).toFixed(6)}`);
    }
  }

  return rows.join('\n');
}
