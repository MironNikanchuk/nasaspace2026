import { useLanguage } from "./language";
import { MaterialSymbol } from "./material-symbol";

export type SceneMode = "2d" | "3d";

export function ViewMode({ mode, onChange }: { mode: SceneMode; onChange: (mode: SceneMode) => void }) {
  const { t } = useLanguage();
  return <div className="view-mode" role="group" aria-label={t("View mode")}>
    <button type="button" aria-pressed={mode === "2d"} onClick={() => onChange("2d")}><MaterialSymbol name="map" size={15} />2D</button>
    <button type="button" aria-pressed={mode === "3d"} onClick={() => onChange("3d")}><MaterialSymbol name="view_in_ar" size={15} />3D</button>
  </div>;
}
