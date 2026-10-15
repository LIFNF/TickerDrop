type Tone = "blue" | "red";

// sprite grid; every cell becomes one crisp square
const W = 100;
const H = 46;
const FANS = [27, 73];
const FY = 19;
const R = 13;
const BLADES = 7;
const FRAMES = 4;

const LED: Record<Tone, [string, string, string]> = {
  blue: ["#c8f6ff", "#29d8ff", "#0a5cff"],
  red: ["#ffd3d7", "#ff3346", "#a10d22"],
};

const INK = "#07080a";

type Grid = (string | undefined)[];

function grid() {
  const g: Grid = new Array(W * H);
  const set = (x: number, y: number, c: string | undefined) => {
    if (x >= 0 && x < W && y >= 0 && y < H) g[y * W + x] = c;
  };
  const rect = (x: number, y: number, w: number, h: number, c: string | undefined) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, c);
  };
  return { g, set, rect };
}

// one row-merged <rect> per run of equal colour
function svg(g: Grid) {
  let out = "";
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = g[y * W + x];
      let n = 1;
      while (x + n < W && g[y * W + x + n] === c) n++;
      if (c) out += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${c}"/>`;
      x += n;
    }
  }
  return out;
}

function polar(x: number, y: number, cx: number) {
  const dx = x + 0.5 - cx;
  const dy = y + 0.5 - FY;
  return { d: Math.hypot(dx, dy), a: Math.atan2(dy, dx) };
}

function body(tone: Tone) {
  const [hot, mid, deep] = LED[tone];
  const { g, set, rect } = grid();

  // PCIe fingers
  rect(22, 37, 42, 5, "#0d3b2a");
  for (let i = 23; i < 63; i += 2) {
    rect(i, 38, 1, 4, "#d9a63a");
    set(i, 38, "#ffe7a1");
  }
  rect(40, 37, 2, 5, undefined);

  // I/O bracket
  rect(0, 0, 4, 44, "#8d939d");
  rect(0, 0, 1, 44, "#d5dae1");
  rect(3, 0, 1, 44, "#5b616b");
  for (let y = 4; y < 30; y += 3) rect(1, y, 2, 2, "#2a2e35");
  rect(1, 44, 2, 2, "#8d939d");

  // shroud: ink outline, silver frame, dark plate with fin texture
  rect(5, 1, 93, 37, INK);
  rect(6, 2, 91, 35, "#a7adb7");
  rect(6, 2, 91, 1, "#e6e9ee");
  rect(6, 36, 91, 1, "#5e646e");
  rect(8, 4, 87, 31, "#1d2026");
  rect(8, 4, 87, 1, "#2c3038");
  for (let x = 9; x < 95; x += 2) rect(x, 5, 1, 29, "#191b20");
  // chamfered top-right corner
  for (let k = 0; k < 4; k++) {
    rect(95 + k, 1 + k, 3 - k, 1, undefined);
    set(94 + k, 1 + k, INK);
  }

  // light bar between the fans
  rect(48, 5, 4, 29, INK);
  rect(49, 6, 1, 27, hot);
  rect(50, 6, 1, 27, mid);

  // fans: well, LED ring with a dithered spill, hub
  for (const cx of FANS) {
    for (let y = FY - R - 2; y <= FY + R + 2; y++)
      for (let x = cx - R - 2; x <= cx + R + 2; x++) {
        const { d } = polar(x, y, cx);
        if (d > R + 1.5) continue;
        if (d > R + 0.5) {
          if ((x + y) % 2 === 0) set(x, y, deep);
        } else if (d > R - 0.5) set(x, y, INK);
        else if (d > R - 1.5) set(x, y, hot);
        else if (d > R - 2.5) set(x, y, mid);
        else if (d > R - 4.5 && (x + y) % 2 === 0) set(x, y, deep);
        else set(x, y, "#0b0c10");
      }
  }

  // power plug, screws
  rect(78, 0, 10, 2, INK);
  for (let x = 79; x < 87; x += 2) set(x, 0, mid);
  for (const [x, y] of [
    [10, 6],
    [91, 6],
    [10, 32],
    [91, 32],
  ]) {
    set(x, y, "#c2c7cf");
    set(x + 1, y + 1, "#4a4f58");
  }
  return svg(g);
}

function hub(tone: Tone) {
  const [hot] = LED[tone];
  const { g, set } = grid();
  for (const cx of FANS)
    for (let y = FY - 5; y <= FY + 5; y++)
      for (let x = cx - 5; x <= cx + 5; x++) {
        const { d } = polar(x, y, cx);
        if (d > 4.3) continue;
        set(x, y, d > 3.4 ? INK : d < 1.5 ? hot : "#2c3038");
      }
  return svg(g);
}

function blades(f: number, dir: number) {
  const { g, set } = grid();
  for (const cx of FANS)
    for (let y = FY - R; y <= FY + R; y++)
      for (let x = cx - R; x <= cx + R; x++) {
        const { d, a } = polar(x, y, cx);
        if (d <= 4 || d > R - 2.5) continue;
        const u = (dir * a) / (2 * Math.PI) * BLADES + (d - 4) * 0.07 + f / FRAMES;
        const t = u - Math.floor(u);
        if (t < 0.44) set(x, y, t < 0.12 ? "#8a919e" : "#4a4f5a");
      }
  return svg(g);
}

const SPRITE: Record<Tone, string> = { blue: "", red: "" };

function sprite(tone: Tone) {
  if (!SPRITE[tone]) {
    const dir = tone === "blue" ? 1 : -1;
    const frames = Array.from({ length: FRAMES }, (_, f) => `<g class="f f${f}">${blades(f, dir)}</g>`).join("");
    SPRITE[tone] = body(tone) + frames + hub(tone);
  }
  return SPRITE[tone];
}

export function Gpu({ tone }: { tone: Tone }) {
  return (
    <svg
      className="gpu"
      viewBox={`0 0 ${W} ${H}`}
      shapeRendering="crispEdges"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: sprite(tone) }}
    />
  );
}
