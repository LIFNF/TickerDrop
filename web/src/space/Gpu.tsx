type Tone = "blue" | "red";

// fan centre x, y and LED ring radius, as fractions of the image width/height/width
type Fan = [number, number, number];

const ART: Record<Tone, { w: number; h: number; fans: Fan[] }> = {
  blue: {
    w: 1084,
    h: 582,
    fans: [
      [0.2795, 0.4072, 0.173],
      [0.756, 0.4072, 0.1847],
    ],
  },
  red: {
    w: 1098,
    h: 548,
    fans: [
      [0.2782, 0.4097, 0.1694],
      [0.7687, 0.4069, 0.1753],
    ],
  },
};

// blades stop just inside the LED ring
const ROTOR = 0.9;

export function Gpu({ tone }: { tone: Tone }) {
  const a = ART[tone];
  const src = `${import.meta.env.BASE_URL}img/gpu-${tone}.webp`;
  const hw = a.h / a.w;
  return (
    <div className="gpu" style={{ aspectRatio: `${a.w} / ${a.h}` }} aria-hidden>
      <img src={src} alt="" draggable={false} />
      {a.fans.map(([x, y, r], i) => {
        const d = 2 * r * ROTOR;
        return (
          <span
            key={i}
            className="rotor"
            style={{
              left: `${(x - d / 2) * 100}%`,
              top: `${((y * hw - d / 2) / hw) * 100}%`,
              width: `${d * 100}%`,
              animationDuration: `${tone === "blue" ? 1.9 + i * 0.2 : 2.1 - i * 0.2}s`,
            }}
          >
            <img
              src={src}
              alt=""
              draggable={false}
              style={{ width: `${100 / d}%`, left: `${(-(x - d / 2) / d) * 100}%`, top: `${(-(y * hw - d / 2) / d) * 100}%` }}
            />
          </span>
        );
      })}
    </div>
  );
}
