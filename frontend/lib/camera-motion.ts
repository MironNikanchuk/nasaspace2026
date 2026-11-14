export type CameraFrame = { yaw: number; pitch: number; zoom: number; x: number; y: number };

const HOME: CameraFrame = { yaw: 0, pitch: 0, zoom: 1, x: 0, y: 0 };

export function connectCamera(
  surface: HTMLElement,
  draw: (frame: CameraFrame) => void,
  { pan = false, maxZoom = 2.6, minZoom = 0.8 }: {
    pan?: boolean; maxZoom?: number; minZoom?: number;
  } = {},
) {
  const current = { ...HOME };
  const target = { ...HOME };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let request = 0;
  let pointer: number | undefined;
  let lastX = 0;
  let lastY = 0;

  function frame() {
    request = 0;
    let moving = false;
    for (const key of Object.keys(target) as (keyof CameraFrame)[]) {
      const delta = target[key] - current[key];
      const settled = reducedMotion.matches || Math.abs(delta) < 0.001;
      current[key] = settled ? target[key] : current[key] + delta * 0.28;
      moving ||= !settled;
    }
    draw(current);
    if (moving) request = requestAnimationFrame(frame);
  }

  function schedule() {
    if (!request) request = requestAnimationFrame(frame);
  }

  function move(dx: number, dy: number, translate = false) {
    if (pan && translate) {
      target.x = Math.max(-.65, Math.min(.65, target.x + dx / surface.clientWidth));
      target.y = Math.max(-.65, Math.min(.65, target.y + dy / surface.clientHeight));
    } else {
      target.yaw += dx * 0.32;
      target.pitch = Math.max(-175, Math.min(175, target.pitch + dy * 0.28));
    }
    schedule();
  }

  function zoom(factor: number) {
    target.zoom = Math.max(minZoom, Math.min(maxZoom, target.zoom * factor));
    schedule();
  }

  function reset() {
    Object.assign(target, HOME);
    schedule();
  }

  function start(event: PointerEvent) {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return;
    if (pointer !== undefined) return;
    pointer = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    surface.setPointerCapture(pointer);
    surface.focus({ preventScroll: true });
    surface.dataset.dragging = "true";
  }
  function drag(event: PointerEvent) {
    if (pointer !== event.pointerId) return;
    move(event.clientX - lastX, event.clientY - lastY, event.shiftKey || surface.dataset.panning === "true");
    lastX = event.clientX;
    lastY = event.clientY;
  }
  function finish(event: PointerEvent) {
    if (pointer !== event.pointerId) return;
    pointer = undefined;
    delete surface.dataset.dragging;
  }
  function wheel(event: WheelEvent) {
    if (document.activeElement !== surface) return;
    event.preventDefault();
    zoom(Math.exp(-Math.sign(event.deltaY) * .13));
  }
  function keyboard(event: KeyboardEvent) {
    if (event.target !== surface) return;
    switch (event.key) {
      case "ArrowLeft": move(-30, 0, event.shiftKey); break;
      case "ArrowRight": move(30, 0, event.shiftKey); break;
      case "ArrowUp": move(0, -24, event.shiftKey); break;
      case "ArrowDown": move(0, 24, event.shiftKey); break;
      case "+":
      case "=": zoom(1.24); break;
      case "-": zoom(1 / 1.24); break;
      case "Home": reset(); break;
      default: return;
    }
    event.preventDefault();
  }

  surface.addEventListener("pointerdown", start);
  surface.addEventListener("pointermove", drag);
  surface.addEventListener("pointerup", finish);
  surface.addEventListener("pointercancel", finish);
  surface.addEventListener("lostpointercapture", finish);
  surface.addEventListener("wheel", wheel, { passive: false });
  surface.addEventListener("keydown", keyboard);

  return {
    reset,
    zoom,
    dispose() {
      cancelAnimationFrame(request);
      surface.removeEventListener("pointerdown", start);
      surface.removeEventListener("pointermove", drag);
      surface.removeEventListener("pointerup", finish);
      surface.removeEventListener("pointercancel", finish);
      surface.removeEventListener("lostpointercapture", finish);
      surface.removeEventListener("wheel", wheel);
      surface.removeEventListener("keydown", keyboard);
    },
  };
}
