import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";

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

const FONTS = [
  { name: "Inter", data: interRegular, weight: 400, style: "normal" },
  { name: "Inter", data: interMedium, weight: 500, style: "normal" },
];

async function renderPng(element) {
  const svg = await satori(element, {
    width: WIDTH,
    height: HEIGHT,
    fonts: FONTS,
  });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } });
  return resvg.render().asPng();
}

function buildSiteOg() {
  return h(
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
        "Oscar Fernandez",
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
    buildFooter(),
  );
}

function buildPostOg(title) {
  return h(
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
            fontSize: 24,
            fontWeight: 400,
            color: "#6b6b6b",
            letterSpacing: "-0.5px",
            lineHeight: 1,
            marginBottom: 32,
          },
        },
        "bytay.dev/blog",
      ),
      h(
        "div",
        {
          style: {
            fontSize: 52,
            fontWeight: 500,
            color: "#e6e6e6",
            letterSpacing: "-2px",
            lineHeight: 1.2,
          },
        },
        title,
      ),
    ),
    buildFooter(),
  );
}

function buildFooter() {
  return h(
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
          color: "#6b6b6b",
          letterSpacing: "0.04em",
        },
      },
      "Oscar Fernandez",
    ),
  );
}

console.log("Generating OG images...\n");

const siteOgPath = resolve(root, "public", "og.png");
writeFileSync(siteOgPath, await renderPng(buildSiteOg()));
console.log(`  ✓ og.png`);

const blogDir = resolve(root, "src", "content", "blog");
const outDir = resolve(root, "public", "og", "blog");
mkdirSync(outDir, { recursive: true });

const posts = readdirSync(blogDir)
  .filter((f) => f.endsWith(".md"))
  .map((f) => {
    const raw = readFileSync(resolve(blogDir, f), "utf-8");
    const { data } = matter(raw);
    const slug = f.replace(/\.md$/, "");
    return { slug, title: data.title, draft: data.draft };
  })
  .filter((p) => !p.draft);

for (const post of posts) {
  const png = await renderPng(buildPostOg(post.title));
  writeFileSync(resolve(outDir, `${post.slug}.png`), png);
  console.log(`  ✓ og/blog/${post.slug}.png`);
}

console.log(`\n✓ Generated ${posts.length + 1} OG images`);
