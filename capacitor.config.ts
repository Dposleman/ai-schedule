import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // appId intentionally left unchanged — it's the Android package identity
  // (signing, any future Play Store listing); renaming it is a separate,
  // deliberate migration, not part of a visual rebrand.
  appId: "com.aischedule.mobile",
  appName: "UnderStack Shift",
  webDir: "mobile-dist",
  android: {
    // Matches the new --canvas token (Harbor Navy palette, Phase 9).
    backgroundColor: "#F5F6F8",
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
