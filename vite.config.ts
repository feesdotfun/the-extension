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
  "ws-interceptor": defineConfig({
    resolve: {
      alias: { "@": resolve(__dirname, "./src") },
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, "src/inject/ws-interceptor.ts"),
        name: "wsInterceptor",
        formats: ["iife"],
        fileName: () => "ws-interceptor.js",
      },
    },
  }),
  "http-interceptor": defineConfig({
    resolve: {
      alias: { "@": resolve(__dirname, "./src") },
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, "src/inject/http-interceptor.ts"),
        name: "httpInterceptor",
        formats: ["iife"],
        fileName: () => "http-interceptor.js",
      },
    },
  }),
  "j7-interceptor": defineConfig({
    resolve: {
      alias: { "@": resolve(__dirname, "./src") },
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, "src/inject/j7-interceptor.ts"),
        name: "j7Interceptor",
        formats: ["iife"],
        fileName: () => "j7-interceptor.js",
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
  "axiom-interceptor": defineConfig({
    resolve: {
      alias: { "@": resolve(__dirname, "./src") },
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, "src/inject/axiom-interceptor.ts"),
        name: "axiomInterceptor",
        formats: ["iife"],
        fileName: () => "axiom-interceptor.js",
      },
    },
  }),
  shield: defineConfig({
    resolve: {
      alias: { "@": resolve(__dirname, "./src") },
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, "src/inject/shield.ts"),
        name: "shield",
        formats: ["iife"],
        fileName: () => "shield.js",
      },
    },
  }),
};

export default configs[target];
