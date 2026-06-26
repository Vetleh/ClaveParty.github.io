// Pure wheel geometry. No DOM. Angles in degrees, measured clockwise from the
// top (12 o'clock) — that is where the fixed pointer sits. Stubbable/testable
// in isolation, mirroring selection.js.

export function wedgeAngles(n) {
  const seg = 360 / n;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const start = i * seg;
    const end = (i + 1) * seg;
    out.push({ start, end, mid: start + seg / 2 });
  }
  return out;
}

// Absolute rotation (deg) that brings `winnerIndex`'s wedge midpoint under the
// top pointer. Rotating the wheel clockwise by R moves content at wheel-angle a
// to screen-angle a + R; we want the winner's mid to reach 0 (mod 360), i.e.
// R ≡ -mid. We then pick the smallest such R that is at least `turns` full
// revolutions beyond `currentRotation`, so the wheel always spins forward.
export function rotationFor(winnerIndex, n, currentRotation = 0, turns = 5) {
  const seg = 360 / n;
  const mid = winnerIndex * seg + seg / 2;
  const targetMod = (((-mid) % 360) + 360) % 360;
  const minRotation = currentRotation + turns * 360;
  const k = Math.ceil((minRotation - targetMod) / 360);
  return targetMod + k * 360;
}
