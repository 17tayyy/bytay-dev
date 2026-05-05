import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const interRegular = readFileSync(
  resolve(
    root,
    "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff",
  ),
);
const interMedium = readFileSync(
  resolve(
    root,
    "node_modules/@fontsource/inter/files/inter-latin-500-normal.woff",
  ),
);

function h(type, props, ...children) {
  return {
    $$typeof: Symbol.for("react.element"),
    type,
    key: null,
    ref: null,
    props: {
      ...(props ?? {}),
      children:
        children.length === 0
          ? undefined
          : children.length === 1
            ? children[0]
            : children,
    },
    _owner: null,
  };
}

const WIDTH = 1200;
const HEIGHT = 630;

const element = h(
  "div",
  {
    style: {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      backgroundColor: "#0a0a0a",
      padding: "80px 90px",
      fontFamily: "Inter",
    },
  },
  h(
    "div",
    { style: { display: "flex", flexDirection: "column" } },
    h(
      "div",
      {
        style: {
          fontSize: 108,
          fontWeight: 500,
          color: "#e6e6e6",
          letterSpacing: "-6px",
          lineHeight: 1,
          marginBottom: 28,
        },
      },
      "tay",
    ),
    h(
      "div",
      {
        style: {
          fontSize: 30,
          fontWeight: 400,
          color: "#6b6b6b",
          letterSpacing: "-0.5px",
          lineHeight: 1.4,
        },
      },
      "Backend developer & security researcher",
    ),
  ),
  h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 14,
      },
    },
    h("div", {
      style: {
        width: 4,
        height: 26,
        backgroundColor: "#f97316",
        borderRadius: 2,
      },
    }),
    h(
      "div",
      {
        style: {
          fontSize: 24,
          fontWeight: 400,
          color: "#3a3a3a",
          letterSpacing: "0.04em",
        },
      },
      "bytay.dev",
    ),
  ),
);

console.log("Generating OG image...");

const svg = await satori(element, {
  width: WIDTH,
  height: HEIGHT,
  fonts: [
    { name: "Inter", data: interRegular, weight: 400, style: "normal" },
    { name: "Inter", data: interMedium, weight: 500, style: "normal" },
  ],
});

const resvg = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } });
const pngData = resvg.render();
const pngBuffer = pngData.asPng();

const outputPath = resolve(root, "public", "og.png");
writeFileSync(outputPath, pngBuffer);

console.log(
  `✓ Generated ${outputPath} (${(pngBuffer.byteLength / 1024).toFixed(1)} KB)`,
);
