import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

const target = process.env.BUILD_TARGET || "popup";

const configs: Record<string, ReturnType<typeof defineConfig>> = {
  popup: defineConfig({
    plugins: [react()],
    resolve: {
      alias: { "@": resolve(__dirname, "./src") },
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      rollupOptions: {
        input: resolve(__dirname, "src/popup/index.html"),
        output: {
          entryFileNames: "popup/[name].js",
          chunkFileNames: "popup/[name]-[hash].js",
          assetFileNames: "popup/[name]-[hash].[ext]",
        },
      },
    },
  }),
  background: defineConfig({
    resolve: {
      alias: { "@": resolve(__dirname, "./src") },
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, "src/background/background.ts"),
        name: "background",
        formats: ["iife"],
        fileName: () => "background.js",
      },
    },
  }),
  content: defineConfig({
    resolve: {
      alias: { "@": resolve(__dirname, "./src") },
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, "src/content/content.ts"),
        name: "content",
        formats: ["iife"],
        fileName: () => "content.js",
      },
    },
  }),
  "uxento": defineConfig({
    resolve: {
      alias: { "@": resolve(__dirname, "./src") },
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, "src/inject/uxento.ts"),
        name: "uxento",
        formats: ["iife"],
        fileName: () => "uxento.js",
      },
    },
  }),
  "rapidlaunch": defineConfig({
    resolve: {
      alias: { "@": resolve(__dirname, "./src") },
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, "src/inject/rapidlaunch.ts"),
        name: "rapidlaunch",
        formats: ["iife"],
        fileName: () => "rapidlaunch.js",
      },
    },
  }),
  "j7tracker": defineConfig({
    resolve: {
      alias: { "@": resolve(__dirname, "./src") },
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, "src/inject/j7tracker.ts"),
        name: "j7tracker",
        formats: ["iife"],
        fileName: () => "j7tracker.js",
      },
    },
  }),
  "axiom-cache-bridge": defineConfig({
    resolve: {
      alias: { "@": resolve(__dirname, "./src") },
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, "src/content/axiom-cache-bridge.ts"),
        name: "axiomCacheBridge",
        formats: ["iife"],
        fileName: () => "axiom-cache-bridge.js",
      },
    },
  }),
  "aegis-preload-strip": defineConfig({
    resolve: {
      alias: { "@": resolve(__dirname, "./src") },
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, "src/inject/aegis-modulepreload-strip.ts"),
        name: "aegisPreloadStrip",
        formats: ["iife"],
        fileName: () => "aegis-preload-strip.js",
      },
    },
  }),
  "axiom": defineConfig({
    resolve: {
      alias: { "@": resolve(__dirname, "./src") },
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, "src/inject/axiom.ts"),
        name: "axiom",
        formats: ["iife"],
        fileName: () => "axiom.js",
      },
    },
  }),
};

export default configs[target];
