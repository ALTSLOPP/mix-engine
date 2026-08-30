import { perfCanvas } from './dom';

// --- Real-time Performance Canvas Line Chart -------------------------------
const fpsHistory: number[] = [];

export function drawPerformanceGraph(fps: number): void {
  if (!perfCanvas) return;
  const ctx = perfCanvas.getContext('2d');
  if (!ctx) return;

  // Keep the drawing buffer matched to the displayed CSS size (avoid blurry stretch).
  const dispW = perfCanvas.clientWidth || perfCanvas.width;
  const dispH = perfCanvas.clientHeight || perfCanvas.height;
  if (perfCanvas.width !== dispW || perfCanvas.height !== dispH) {
    perfCanvas.width = dispW;
    perfCanvas.height = dispH;
  }

  fpsHistory.push(fps);
  if (fpsHistory.length > 80) fpsHistory.shift();

  ctx.clearRect(0, 0, perfCanvas.width, perfCanvas.height);

  // Colour the graph by FPS band (green ≥50, gold 30-49, red <30).
  const fpsCol = fps >= 50 ? '0, 240, 255' : fps >= 30 ? '255, 212, 121' : '239, 68, 68';

  // Create gradient
  const grad = ctx.createLinearGradient(0, 0, 0, perfCanvas.height);
  grad.addColorStop(0, `rgba(${fpsCol}, 0.4)`);
  grad.addColorStop(1, `rgba(${fpsCol}, 0.0)`);

  // Draw fill
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, perfCanvas.height);
  for (let i = 0; i < fpsHistory.length; i++) {
    const x = (i / 80) * perfCanvas.width;
    const y = perfCanvas.height - (fpsHistory[i] / 90) * perfCanvas.height;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(perfCanvas.width, perfCanvas.height);
  ctx.closePath();
  ctx.fill();

  // Draw stroke line — 2D canvas can't resolve CSS vars, use a literal hex.
  ctx.strokeStyle = `rgb(${fpsCol})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < fpsHistory.length; i++) {
    const x = (i / 80) * perfCanvas.width;
    const y = perfCanvas.height - (fpsHistory[i] / 90) * perfCanvas.height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
