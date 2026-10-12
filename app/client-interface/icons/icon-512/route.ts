import { createElement } from "react";
import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  const mark = createElement(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "68%",
        height: "68%",
        border: "18px solid #37C6D0",
        borderRadius: "34%",
        color: "#FFFFFF",
        fontSize: 325,
        fontWeight: 800,
        fontFamily: "Arial, Helvetica, sans-serif",
      },
    },
    "V",
  );
  const dot = createElement("div", {
    style: {
      position: "absolute",
      top: "17%",
      right: "17%",
      width: 72,
      height: 72,
      borderRadius: "999px",
      backgroundColor: "#37C6D0",
      border: "14px solid #0B2540",
    },
  });
  const image = createElement("div", {
    style: {
      display: "flex",
      position: "relative",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      background: "linear-gradient(145deg, #0B2540 0%, #123F61 100%)",
    },
  }, mark, dot);
  return new ImageResponse(image, { width: 512, height: 512 });
}