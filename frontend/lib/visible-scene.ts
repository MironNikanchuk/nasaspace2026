export function watchSceneVisibility(node: HTMLElement, redraw: () => void) {
  let intersects = false;
  const active = () => intersects && !document.hidden;
  const observer = new IntersectionObserver(([entry]) => {
    intersects = entry.isIntersecting;
    if (active()) redraw();
  });
  const foreground = () => { if (active()) redraw(); };
  observer.observe(node);
  document.addEventListener("visibilitychange", foreground);
  return {
    active,
    dispose() {
      observer.disconnect();
      document.removeEventListener("visibilitychange", foreground);
    },
  };
}
