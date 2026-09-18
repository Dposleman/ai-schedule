import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.aischedule.mobile",
  appName: "AI Schedule",
  webDir: "mobile-dist",
  android: {
    backgroundColor: "#f7f6fb",
  },
  plugins: {
    SystemBars: {
      insetsHandling: "css",
      style: "DEFAULT",
      hidden: false,
    },
  },
};

export default config;
