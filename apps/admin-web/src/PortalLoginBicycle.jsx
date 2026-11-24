"use client";
import { jsx } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import { loginBicycleMarkup } from "./login-bicycle.js";
function PortalLoginBicycle({ boosted }) {
  const container = useRef(null);
  const boost = useRef(boosted);
  useEffect(() => {
    boost.current = boosted;
  }, [boosted]);
  useEffect(() => {
    const root = container.current?.querySelector("svg");
    if (!root) return;
    const rear = root.querySelector("#rearRotor");
    const front = root.querySelector("#frontRotor");
    const chain = root.querySelector("#chainLinks");
    const level = root.querySelector(".chargeLevel");
    const reveal = root.querySelector(".chargeReveal");
    const full = root.querySelector(".chargeFull");
    if (!rear || !front || !chain || !level || !reveal || !full) return;
    root.classList.add("js");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let angle = 0, phase = 0, charge = 0, speed = 0.12, last = null, frame = 0;
    const chainUnits = 2 * Math.PI * 20.5 * 800 / 660.4316301315156;
    const sample = (p, stops) => {
      for (let i = 1; i < stops.length; i++) {
        const [a, x] = stops[i - 1], [b, y] = stops[i];
        if (p <= b) {
          const t = Math.max(0, Math.min(1, (p - a) / (b - a)));
          return x + (y - x) * t * t * (3 - 2 * t);
        }
      }
      return stops[stops.length - 1][1];
    };
    const render = () => {
      rear.setAttribute("transform", "rotate(" + angle + " 282.5 405.4)");
      front.setAttribute("transform", "rotate(" + angle + " 767 405.5)");
      chain.setAttribute("stroke-dashoffset", String(-phase));
      level.style.opacity = String(sample(charge, [[0, 0], [0.08, 0], [0.14, 0.95], [0.62, 1], [0.78, 1], [0.9, 0], [1, 0]]));
      reveal.setAttribute("transform", "translate(0 " + sample(charge, [[0, 239], [0.08, 239], [0.62, 0], [0.9, 0], [0.91, 239], [1, 239]]) + ")");
      full.style.opacity = String(sample(charge, [[0, 0], [0.6, 0], [0.69, 0.8], [0.76, 0.3], [0.82, 0], [1, 0]]));
      root.setAttribute("data-wheel-speed", speed.toFixed(3));
    };
    const tick = (now) => {
      if (reduced.matches || document.hidden) return;
      const dt = last === null ? 0 : Math.min((now - last) / 1e3, 0.05);
      last = now;
      const target = boost.current ? 1.15 : 0.12;
      speed += (target - speed) * (1 - Math.exp(-dt / (target > speed ? 0.75 : 0.9)));
      angle = (angle + speed * 360 * dt) % 360;
      phase = (phase + speed * dt * chainUnits) % 10;
      charge = (charge + (1 / 20 + Math.max(0, Math.min(1, (speed - 0.12) / 1.03)) * (1 / 2.2 - 1 / 20)) * dt) % 1;
      render();
      frame = requestAnimationFrame(tick);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      last = null;
      if (!reduced.matches && !document.hidden) frame = requestAnimationFrame(tick);
    };
    render();
    restart();
    reduced.addEventListener("change", restart);
    document.addEventListener("visibilitychange", restart);
    return () => {
      cancelAnimationFrame(frame);
      reduced.removeEventListener("change", restart);
      document.removeEventListener("visibilitychange", restart);
    };
  }, []);
  return /* @__PURE__ */ jsx("div", { ref: container, "aria-hidden": "true", dangerouslySetInnerHTML: { __html: loginBicycleMarkup } });
}
export {
  PortalLoginBicycle
};
