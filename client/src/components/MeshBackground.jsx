import React from "react";

export default function MeshBackground() {
  return (
    <>
      <div style={styles.mesh}>
        <div style={styles.blob1} />
        <div style={styles.blob2} />
      </div>
      <div style={styles.grid} />
    </>
  );
}

const styles = {
  mesh: {
    position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden",
  },
  blob1: {
    position: "absolute", top: -200, left: -200, width: 700, height: 700,
    background: "radial-gradient(circle, rgba(26,92,255,0.12) 0%, transparent 70%)",
    animation: "drift1 12s ease-in-out infinite alternate",
  },
  blob2: {
    position: "absolute", bottom: -100, right: -100, width: 500, height: 500,
    background: "radial-gradient(circle, rgba(0,196,140,0.08) 0%, transparent 70%)",
    animation: "drift2 15s ease-in-out infinite alternate",
  },
  grid: {
    position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
    backgroundImage: "linear-gradient(rgba(26,92,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(26,92,255,0.04) 1px, transparent 1px)",
    backgroundSize: "40px 40px",
  },
};
