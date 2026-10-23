import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.merlink.app',
  appName: 'Merlink',
  webDir: 'out',
  server: {
    // For development, point to the local dev server.
    // Use the Mac's LAN IP so a physical iPhone can reach it (localhost = the phone itself).
    // Comment this out for production builds.
    url: 'http://192.168.70.235:3000',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#0a0a0a',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0a',
    },
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'Merlink',
  },
  android: {
    backgroundColor: '#0a0a0a',
  },
};

export default config;
