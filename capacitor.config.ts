import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cash.wojakcoin.wallet',
  appName: 'Wojakcoinwallet',
  webDir: 'out',
  server: {
    // For production, point to your deployed Next.js app to use API routes:
    // url: 'https://your-domain.com',
    // cleartext: true,
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
