import type { Camera } from "./camera";

// a night photo under the map; drifts a little with the camera and backs off as you zoom in

const img = new Image();
img.decoding = "async";
img.src = `${import.meta.env.BASE_URL}img/city.webp`;

export function drawCity(ctx: CanvasRenderingContext2D, w: number, h: number, cam: Camera) {
  if (!img.complete || !img.naturalWidth) return;
  const fade = Math.max(0.3, Math.min(1, 1.2 - cam.k * 0.4));
  const ratio = img.naturalHeight / img.naturalWidth;
  const zoom = 1 + Math.max(-1, Math.min(2, Math.log2(cam.k / 0.45))) * 0.025;
  const iw = Math.max(w * 1.12, (h * 0.78) / ratio) * zoom;
  const ih = iw * ratio;

  const c = cam.toWorld(w / 2, h / 2);
  const slack = (iw - w) / 2;
  const x = (w - iw) / 2 + Math.max(-slack, Math.min(slack, -c.x * 0.03));
  const y = h - ih + 24 + Math.max(-24, Math.min(24, -c.y * 0.012));

  ctx.globalAlpha = 0.5 * fade;
  ctx.drawImage(img, x, y, iw, ih);
  ctx.globalAlpha = 1;

  // sink the photo's sky into the page colour so the stars sit on black
  const top = ctx.createLinearGradient(0, y, 0, y + ih * 0.62);
  top.addColorStop(0, "rgba(5,6,10,1)");
  top.addColorStop(0.55, "rgba(5,6,10,.75)");
  top.addColorStop(1, "rgba(5,6,10,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, Math.min(0, y), w, y + ih * 0.62 - Math.min(0, y));

  const side = ctx.createRadialGradient(w / 2, h * 0.75, h * 0.2, w / 2, h * 0.75, Math.max(w, h) * 0.8);
  side.addColorStop(0, "rgba(5,6,10,0)");
  side.addColorStop(1, "rgba(5,6,10,.7)");
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, w, h);
}
