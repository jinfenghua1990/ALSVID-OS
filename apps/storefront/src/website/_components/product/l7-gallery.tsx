"use client";

import { useState } from "react";
import { translator, type Locale } from "../../_lib/i18n";
import styles from "./l8-product.module.css";

export function L7Gallery({ locale, catalogImages, productTitle }: { locale: Locale; catalogImages?: { url: string }[]; productTitle?: string }) {
  const [photo, setPhoto] = useState<"side" | "folded">("side");
  const t = translator(locale);
  const photos = ["side", "folded"] as const;
  return <div className={styles.gallery} data-l7-gallery>
    <div className={styles.stage} id="l7-photo" aria-live="polite">
      <img key={photo} src={photo === "side" ? catalogImages?.[0]?.url || `/products/l7/reference-${photo}.jpg` : catalogImages?.[1]?.url || `/products/l7/reference-${photo}.jpg`} width={1024} height={1024}
        alt={productTitle || t(`l7.gallery.${photo}.alt`)} fetchPriority="high" data-l7-photo={photo} />
    </div>
    <div className={styles.galleryControls} role="group" aria-label={t("l7.gallery.label")}>
      {photos.map(id => <button key={id} type="button" aria-controls="l7-photo" aria-pressed={photo === id}
        onClick={() => setPhoto(id)}>{t(`l7.gallery.${id}`)}</button>)}
    </div>
    <p className={styles.note}>{t("l7.photo.note")}</p>
  </div>;
}
