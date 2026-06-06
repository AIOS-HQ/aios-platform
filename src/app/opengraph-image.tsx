import { ImageResponse } from "next/og";

export const alt = "Harmony — The Autonomous Operating System for Life and Business";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Dynamic social card for the Harmony landing page (brand-on-dark). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          color: "#eaf2ff",
          backgroundColor: "#070b16",
          backgroundImage:
            "radial-gradient(900px 500px at 50% 8%, rgba(47,107,255,0.35), rgba(7,11,22,0)), linear-gradient(135deg, #060a14 0%, #0a1430 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: 999,
              border: "5px solid #3f8bff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
            }}
          >
            <div style={{ width: 11, height: 46, borderRadius: 6, backgroundColor: "#eef5fe" }} />
            <div style={{ width: 11, height: 46, borderRadius: 6, backgroundColor: "#eef5fe" }} />
          </div>
          <div style={{ fontSize: 46, fontWeight: 700, letterSpacing: -1 }}>Harmony</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, maxWidth: 980 }}>
            Run your life. Run your business.
          </div>
          <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, color: "#5aa6ff" }}>
            Harmony handles the work.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 28, color: "#9bb3d4" }}>
            The Autonomous Operating System for Life and Business
          </div>
          <div style={{ fontSize: 22, color: "#5f7aa6" }}>by AIOS</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
