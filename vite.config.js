import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react(),
    // Strip crossorigin attribute from scripts/links for WebKitGTK compatibility in Flatpak
    {
      name: "strip-crossorigin",
      transformIndexHtml(html) {
        return html.replace(/ crossorigin/g, "");
      },
    },
  ],
  build: {
    // Target Safari 15 to ensure compatibility with WebKitGTK in Flatpak runtimes
    target: ["es2021", "safari15"],
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (id.includes("react") || id.includes("scheduler")) {
            return "react-vendor";
          }
          if (id.includes("react-router")) {
            return "router-vendor";
          }
          if (id.includes("@tauri-apps")) {
            return "tauri-vendor";
          }
          if (id.includes("@xyflow")) {
            return "canvas-vendor";
          }
          if (id.includes("d3")) {
            return "charts-vendor";
          }
          if (
            id.includes("react-syntax-highlighter")
            || id.includes("refractor")
            || id.includes("highlight.js")
            || id.includes("lowlight")
          ) {
            return "syntax-vendor";
          }
          if (
            id.includes("react-markdown")
            || id.includes("remark-gfm")
            || id.includes("remark-")
            || id.includes("rehype-")
            || id.includes("mdast-")
            || id.includes("micromark")
            || id.includes("hast-")
            || id.includes("unist-")
            || id.includes("unified")
            || id.includes("vfile")
            || id.includes("property-information")
            || id.includes("parse-entities")
            || id.includes("character-entities")
            || id.includes("decode-named-character-reference")
            || id.includes("comma-separated-tokens")
            || id.includes("space-separated-tokens")
            || id.includes("markdown-table")
            || id.includes("style-to-object")
            || id.includes("style-to-js")
            || id.includes("inline-style-parser")
            || id.includes("html-url-attributes")
            || id.includes("ccount")
            || id.includes("trough")
            || id.includes("bail")
            || id.includes("devlop")
          ) {
            return "markdown-vendor";
          }
          return "vendor";
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
