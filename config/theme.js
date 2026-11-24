export default {
  cssVar: true,
  token: {
    colorPrimary: "#2564ff",
    borderRadius: 0,
  },
  components: {
    Typography: {
      colorBgContainer: "transparent",
      colorTextHeading: "var(--title-color)",
      colorText: "var(--theme-text-color)",
      fontWeightStrong: 400,
      fontFamily: "var(--title-font-family)",
    },
    Button: {
      colorBgContainer: "transparent",
      colorText: "var(--theme-text-color)",
    },
    Input: {
      colorBgContainer: "transparent",
      colorText: "var(--theme-text-color)",
    },
    Card: {
      colorText: "var(--theme-text-color)",
      colorTextHeading: "var(--theme-text-color)",
      headerFontSize: 20,
    },
    Modal: {
      colorBgElevated: "#1f1f1f",
      titleColor: "var(--theme-text-color)",
      colorText: "var(--theme-text-color)",
    },
  },
};
