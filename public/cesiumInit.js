// 在 Cesium 加载前设置静态资源基础路径
// Dev: public/ 目录被 umi dev server 自动托管，assets 在 /cesium/
// Prod: Umi 自动将 public/ 复制到 dist/，cesium/ 与 index.html 同级
window.CESIUM_BASE_URL = "./cesium/";
