import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0e6e5c",
          fontFamily: "monospace",
          fontSize: 92,
          fontWeight: 700,
          letterSpacing: -4,
          color: "#f7f8fa",
        }}
      >
        [P]
      </div>
    ),
    { ...size },
  );
}
