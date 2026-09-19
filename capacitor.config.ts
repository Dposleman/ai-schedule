import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // appId intentionally left unchanged — it's the Android package identity
  // (signing, any future Play Store listing); renaming it is a separate,
  // deliberate migration, not part of a visual rebrand.
  appId: "com.aischedule.mobile",
  appName: "UnderStack Shift",
  webDir: "mobile-dist",
  android: {
    backgroundColor: "#F4F3F0",
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
