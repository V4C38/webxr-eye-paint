import { Painter, Eye, Tool } from './painter';
import { ColorWheel } from './colorwheel';
import { SnapshotSync } from './snapshotsync';
import { XRView } from './xrview';

const leftCanvas = document.getElementById('left') as HTMLCanvasElement;
const rightCanvas = document.getElementById('right') as HTMLCanvasElement;
const colorWheelCanvas = document.getElementById('color-wheel') as HTMLCanvasElement;
const brightnessSlider = document.getElementById('brightness') as HTMLInputElement;
const widthSlider = document.getElementById('width') as HTMLInputElement;
const featherSlider = document.getElementById('feather') as HTMLInputElement;
const brushRadio = document.getElementById('tool-brush') as HTMLInputElement;
const eraserRadio = document.getElementById('tool-eraser') as HTMLInputElement;
const clearLeftBtn = document.getElementById('clear-left') as HTMLButtonElement;
const clearRightBtn = document.getElementById('clear-right') as HTMLButtonElement;
const xrButton = document.getElementById('xr-button') as HTMLButtonElement;

const painter = new Painter({ left: leftCanvas, right: rightCanvas }, 2048);
const colorWheel = new ColorWheel(colorWheelCanvas);
const snapshot = new SnapshotSync('', painter);
const xrView = new XRView(painter);

snapshot.start();

// Tool wiring
function updateTool(): void {
  painter.setTool(brushRadio.checked ? 'brush' : 'eraser');
}
brushRadio.addEventListener('change', updateTool);
eraserRadio.addEventListener('change', updateTool);
updateTool();

// Width / feather
widthSlider.addEventListener('input', () => {
  const w = parseInt(widthSlider.value, 10);
  painter.setWidth(w);
  updateCursorSize('left');
  updateCursorSize('right');
});
featherSlider.addEventListener('input', () => painter.setFeather(parseFloat(featherSlider.value)));

// Color
let hsv: { h: number; s: number; v: number } = { h: 0, s: 1, v: 1 };
colorWheel.onChange((h: number, s: number) => {
  hsv.h = h; hsv.s = s;
  painter.setColorHSV(hsv.h, hsv.s, hsv.v);
});
brightnessSlider.addEventListener('input', () => {
  hsv.v = parseFloat(brightnessSlider.value);
  painter.setColorHSV(hsv.h, hsv.s, hsv.v);
});

// Pointer handlers
const leftCursor = document.getElementById('left-cursor') as HTMLDivElement;
const rightCursor = document.getElementById('right-cursor') as HTMLDivElement;

function updateCursorSize(eye: Eye): void {
  const el = eye === 'left' ? leftCanvas : rightCanvas;
  const ring = eye === 'left' ? leftCursor : rightCursor;
  const scale = el.clientWidth / el.width;
  const d = Math.max(2, Math.round(parseInt(widthSlider.value, 10) * scale));
  ring.style.width = `${d}px`;
  ring.style.height = `${d}px`;
}

const attachPointer = (eye: Eye, el: HTMLCanvasElement): void => {
  let drawing = false;
  const onDown = (e: PointerEvent): void => {
    drawing = true; el.setPointerCapture(e.pointerId);
    painter.pointerDown(eye, e.offsetX, e.offsetY, el);
  };
  const onMove = (e: PointerEvent): void => {
    if (!drawing) return;
    painter.pointerMove(eye, e.offsetX, e.offsetY, el);
  };
  const onUpCancel = (e: PointerEvent): void => {
    if (!drawing) return;
    drawing = false; el.releasePointerCapture(e.pointerId);
    painter.pointerUp(eye);
    snapshot.scheduleSave(eye);
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUpCancel);
  el.addEventListener('pointercancel', onUpCancel);

  // Cursor ring positioning
  const ring = eye === 'left' ? leftCursor : rightCursor;
  const show = (): void => { ring.style.display = 'block'; updateCursorSize(eye); };
  const hide = (): void => { ring.style.display = 'none'; };
  const move = (e: PointerEvent): void => {
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
  };
  el.addEventListener('pointerenter', show);
  el.addEventListener('pointerleave', hide);
  el.addEventListener('pointermove', move);
};
attachPointer('left', leftCanvas);
attachPointer('right', rightCanvas);

// Clear
clearLeftBtn.addEventListener('click', async () => {
  painter.clearEye('left');
  await snapshot.clearRemote('left');
});
clearRightBtn.addEventListener('click', async () => {
  painter.clearEye('right');
  await snapshot.clearRemote('right');
});

// XR
xrButton.addEventListener('click', () => {
  xrView.enterXR();
});


