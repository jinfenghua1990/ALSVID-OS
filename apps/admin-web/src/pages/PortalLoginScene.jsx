"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { PortalLoginBicycle } from "../PortalLoginBicycle.jsx";
import styles from "./login.module.css";
function PortalLoginScene({ portal, locale, open, busy, locked, formId, actionLabel, onOpen, onClose, children, t, languageSwitcher }) {
  const action = useRef(null);
  const [boosted, setBoosted] = useState(false);
  const [paused, setPaused] = useState(false);
  const close = () => {
    if (locked || busy) return;
    action.current?.focus();
    setBoosted(false);
    onClose();
  };
  useEffect(() => {
    const escape = (event) => {
      if (event.key === "Escape" && open && !locked && !busy) {
        action.current?.focus();
        setBoosted(false);
        onClose();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, locked, busy, onClose]);
  return /* @__PURE__ */ jsxs("main", { lang: locale, "data-portal-login": portal, "data-open": open, className: [styles.page, open ? styles.open : "", paused ? styles.paused : ""].join(" "), children: [
    /* @__PURE__ */ jsx("div", { className: styles.background, "aria-hidden": "true" }),
    /* @__PURE__ */ jsx("div", { className: styles.dither, "aria-hidden": "true" }),
    /* @__PURE__ */ jsxs("header", { className: styles.header, children: [
      /* @__PURE__ */ jsx("a", { className: styles.logo, href: "https://www.alsvidbike.com/" + locale, children: /* @__PURE__ */ jsx("img", { className: "alsvid-brand-logo alsvid-brand-logo--inverse", src: "/alsvid-logo.png", alt: "ALSVID" }) }),
      /* @__PURE__ */ jsxs("div", { className: styles.headerLinks, children: [
        languageSwitcher,
        /* @__PURE__ */ jsx("a", { href: "https://www.alsvidbike.com/" + locale, children: t("auth.return") })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: styles.stage, children: [
      /* @__PURE__ */ jsxs("section", { className: styles.story, children: [
        /* @__PURE__ */ jsx("p", { className: styles.eyebrow, children: t("auth." + portal + ".eyebrow") }),
        /* @__PURE__ */ jsxs("h1", { children: [
          t("auth." + portal + ".line1"),
          /* @__PURE__ */ jsx("br", {}),
          t("auth." + portal + ".line2")
        ] }),
        /* @__PURE__ */ jsx("p", { className: styles.lead, children: t("auth." + portal + ".lead") })
      ] }),
      /* @__PURE__ */ jsx("div", { className: styles.bicycle, children: /* @__PURE__ */ jsx(PortalLoginBicycle, { boosted: boosted && open }) }),
      /* @__PURE__ */ jsxs("section", { className: styles.access, "aria-label": t("auth.form"), children: [
        /* @__PURE__ */ jsx("div", { id: formId + "-region", className: styles.formArea, inert: !open, children }),
        /* @__PURE__ */ jsxs("div", { className: styles.actionArea, children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              ref: action,
              className: styles.action,
              type: open ? "submit" : "button",
              form: open ? formId : void 0,
              "aria-expanded": open,
              "aria-controls": formId + "-region",
              disabled: busy,
              onPointerEnter: () => {
                if (!open) onOpen();
                setBoosted(true);
              },
              onPointerLeave: () => setBoosted(false),
              onFocus: () => {
                if (!open) onOpen();
                setBoosted(true);
              },
              onBlur: () => setBoosted(false),
              onClick: (event) => {
                if (!open) {
                  event.preventDefault();
                  onOpen();
                }
              },
              children: [
                /* @__PURE__ */ jsx("span", { children: busy ? t("auth.busy") : open ? actionLabel : t("auth." + portal + ".entry") }),
                /* @__PURE__ */ jsx("span", { "aria-hidden": "true", children: "\u2192" })
              ]
            }
          ),
          open && !locked ? /* @__PURE__ */ jsx("button", { type: "button", className: styles.close, disabled: busy, onClick: close, "aria-label": t("auth.close"), children: "\xD7" }) : null
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("footer", { className: styles.footer, children: [
      /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => setPaused((value) => !value), "aria-pressed": paused, children: [
        t("auth.background"),
        " \xB7 ",
        t(paused ? "auth.play" : "auth.pause")
      ] }),
      /* @__PURE__ */ jsx("span", { children: t("auth.rights", { year: (/* @__PURE__ */ new Date()).getFullYear() }) })
    ] })
  ] });
}
export {
  PortalLoginScene
};
