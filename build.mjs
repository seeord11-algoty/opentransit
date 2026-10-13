// Empaqueta todo en un solo index.html que funciona sin internet (doble clic).
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
const which = process.argv[2] || "tren";
const cfg = {
  tren: { entry: "src/tren.js", tpl: "src/template_tren.html", out: "dist/OpenTransit_Tren_3D" },
  bus:  { entry: "src/main.js", tpl: "src/template.html",      out: "dist/OpenTransit_3D" },
}[which];
const r = await build({ entryPoints: [cfg.entry], bundle: true, minify: true, format: "iife", target: "es2020", write: false });
const js = r.outputFiles[0].text.replace(/<\/script/g, "<\\/script");
mkdirSync(cfg.out, { recursive: true });
writeFileSync(`${cfg.out}/index.html`, readFileSync(cfg.tpl, "utf8").replace("/*BUNDLE*/", () => js));
console.log("Listo:", `${cfg.out}/index.html`);
