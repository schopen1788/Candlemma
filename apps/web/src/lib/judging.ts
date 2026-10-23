// The question's own server-provided threshold also describes resumed older games.
export function directionRanges(band: number) {
  const value = band.toFixed(1);
  return { up: `+${value}% 초과`, flat: `−${value}%~+${value}%`, down: `−${value}% 미만` };
}
