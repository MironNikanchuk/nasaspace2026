"use client";

import dynamic from "next/dynamic";
import { useLanguage } from "./language";

export const BodyView = dynamic(() => import("./three-body-scene"), {
  ssr: false,
  loading: function Loading() {
    const { t } = useLanguage();
    return <div className="body-view-loading" role="status">{t("Preparing 3D scene…")}</div>;
  },
});
