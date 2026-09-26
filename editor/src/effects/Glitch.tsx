import React, { useId } from "react";
import { random } from "remotion";

// Separação RGB + tremida horizontal, aplicada como filtro SVG em qualquer camada.
// intensity: 0 = sem efeito, 1 = glitch forte. seed muda o "sorteio" a cada quadro.
export const Glitch: React.FC<{ intensity: number; seed: string | number; children: React.ReactNode }> = ({
  intensity,
  seed,
  children,
}) => {
  const id = useId().replace(/:/g, "");
  if (intensity <= 0.001) return <>{children}</>;

  const split = 28 * intensity;
  const jitter = (random(`x${seed}`) - 0.5) * 80 * intensity;
  const skew = (random(`s${seed}`) - 0.5) * 8 * intensity;

  return (
    <>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <filter id={id} x="-10%" y="0" width="120%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
          <feOffset in="r" dx={split} result="r2" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
          <feOffset in="b" dx={-split} result="b2" />
          <feBlend in="r2" in2="g" mode="screen" result="rg" />
          <feBlend in="rg" in2="b2" mode="screen" />
        </filter>
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          filter: `url(#${id})`,
          transform: `translateX(${jitter}px) skewX(${skew}deg)`,
        }}
      >
        {children}
      </div>
    </>
  );
};
