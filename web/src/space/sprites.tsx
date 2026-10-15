import { INK, sprite } from "./pixel";

const GOLD = "#c9952c";
const GOLD_HI = "#ffe08a";

function die() {
  const N = 68;
  const { set, rect, svg } = sprite(N, N);
  rect(0, 0, N, N, INK);
  rect(1, 1, N - 2, N - 2, "#16251c");
  for (let y = 2; y < N - 2; y++) for (let x = 2; x < N - 2; x++) if ((x * 7 + y * 3) % 13 === 0) set(x, y, "#1f3527");

  // pads on all four edges
  for (let i = 8; i < 60; i += 3) {
    for (const [x, y, w, h] of [
      [i, 2, 2, 3],
      [i, N - 5, 2, 3],
      [2, i, 3, 2],
      [N - 5, i, 3, 2],
    ]) {
      rect(x, y, w, h, GOLD);
      set(x, y, GOLD_HI);
    }
  }
  // decoupling caps in the corners
  for (const [x, y] of [
    [3, 3],
    [N - 6, 3],
    [3, N - 5],
    [N - 6, N - 5],
  ]) {
    rect(x, y, 3, 2, "#b8a27a");
    set(x, y, "#e8d8b0");
  }

  // seal ring
  rect(8, 8, 52, 52, "#7a5a16");
  rect(9, 9, 50, 50, "#e0b040");
  rect(9, 9, 50, 1, GOLD_HI);
  rect(9, 9, 1, 50, GOLD_HI);

  // bare die, bevelled, faint grid, one dithered sheen band
  rect(10, 10, 48, 48, "#14151b");
  for (let y = 10; y < 58; y += 4) for (let x = 10; x < 58; x += 4) set(x, y, "#1b1d25");
  for (let y = 10; y < 58; y++)
    for (let x = 10; x < 58; x++) {
      const s = x + y;
      if (s > 30 && s < 40 && s % 2 === 0) set(x, y, "#23252f");
    }
  rect(10, 10, 48, 1, "#2e3140");
  rect(10, 10, 1, 48, "#2e3140");
  rect(10, 57, 48, 1, "#0a0a0e");
  rect(57, 10, 1, 48, "#0a0a0e");
  return svg();
}

let dieArt = "";

export function Die() {
  dieArt ||= die();
  return <svg className="die" viewBox="0 0 68 68" shapeRendering="crispEdges" aria-hidden dangerouslySetInnerHTML={{ __html: dieArt }} />;
}

function clock() {
  const N = 26;
  const c = 13;
  const { set, line, disc, svg } = sprite(N, N);
  disc(c, c, 12.6, (x, y, d) => set(x, y, d > 11.6 ? "#ffd400" : d > 10.8 ? INK : "#0b0c12"));
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 - Math.PI / 2;
    const quarter = k % 3 === 0;
    for (let r = quarter ? 8.6 : 9.6; r <= 10.2; r += 0.8) set(c - 0.5 + Math.cos(a) * r, c - 0.5 + Math.sin(a) * r, quarter ? "#ffd400" : "#6b7086");
  }
  // 09:30
  const hand = (deg: number, len: number, color: string) => {
    const a = (deg - 90) * (Math.PI / 180);
    line(c - 0.5, c - 0.5, c - 0.5 + Math.cos(a) * len, c - 0.5 + Math.sin(a) * len, color);
  };
  hand(285, 5.5, "#e8e9f0");
  hand(180, 8.5, "#ffd400");
  set(c - 1, c - 1, "#ffd400");
  set(c, c - 1, "#ffd400");
  set(c - 1, c, "#ffd400");
  set(c, c, "#ffd400");
  return svg();
}

let clockArt = "";

export function Clock({ size }: { size: number }) {
  clockArt ||= clock();
  return (
    <svg className="dial" viewBox="0 0 26 26" width={size} height={size} shapeRendering="crispEdges" aria-hidden dangerouslySetInnerHTML={{ __html: clockArt }} />
  );
}

// Hardware enclosures share the GPU's silver bevel, dark wells and discrete LEDs.
function enclosure(kind: "mint" | "clock" | "board" | "holder") {
  const { rect, set, svg } = sprite(100, 76);
  const accent = { mint: "#ff65de", clock: "#ffd400", board: "#29d8ff", holder: "#56efa3" }[kind];
  rect(2, 2, 96, 72, INK);
  rect(3, 3, 94, 69, "#555e69");
  rect(3, 3, 94, 1, "#e6e9ee");
  rect(3, 3, 1, 69, "#a7adb7");
  rect(5, 5, 90, 65, "#20262e");
  for (let y = 6; y < 70; y += 2) rect(6, y, 88, 1, "#1b2028");
  rect(8, 10, 84, 53, INK);
  rect(9, 11, 82, 51, "#0b1119");
  rect(10, 12, 80, 1, "#283747");
  for (const [x, y] of [[6, 6], [92, 6], [6, 66], [92, 66]]) {
    rect(x, y, 2, 2, "#a7adb7");
    set(x + 1, y + 1, "#343a44");
  }
  for (let x = 12; x < 67; x += 3) rect(x, 66, 1, 3, "#080b10");
  rect(76, 66, 4, 2, accent);
  rect(83, 66, 4, 2, "#39424e");
  rect(12, 6, 16, 2, accent);
  if (kind === "mint") {
    for (let x = 22; x < 80; x += 3) {
      rect(x, 72, 2, 4, GOLD);
      set(x, 72, GOLD_HI);
    }
  }
  if (kind === "holder") {
    rect(0, 24, 5, 26, "#a7adb7");
    for (let y = 27; y < 49; y += 4) rect(1, y, 2, 2, INK);
    rect(95, 24, 5, 26, "#555e69");
  }
  return svg();
}

const cases = { mint: enclosure("mint"), clock: enclosure("clock"), board: enclosure("board"), holder: enclosure("holder") };

export function Hardware({ kind }: { kind: keyof typeof cases }) {
  return <svg className="hardware" viewBox="0 0 100 76" preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden dangerouslySetInnerHTML={{ __html: cases[kind] }} />;
}
