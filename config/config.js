import { defineConfig } from "@umijs/max";
import process from "node:process";
import routes from "./routes";
import theme from "./theme";

export default defineConfig({
  history: {
    type: "hash",
  },
  antd: {
    theme,
    appConfig: {},
  },
  model: {},
  initialState: {},
  request: {},
  routes,
  mfsu: false,
  npmClient: "pnpm",
  jsMinifier: "terser",
  publicPath: process.env.NODE_ENV === "development" ? "/" : "./",

  // Cesium 静态资源根路径需在 Cesium JS 加载前设定；
  // 运行时配置紧随其后加载，注入 window.appcfg
  headScripts: ["./cesiumInit.js", "./config/app.js"],

  styles: [],
});
