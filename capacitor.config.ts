const serverUrl = process.env.CAP_SERVER_URL?.trim();

const config = {
  appId: "com.vetra.petcare",
  appName: "VETRA",
  webDir: "mobile-shell",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: false,
          allowNavigation: [new URL(serverUrl).hostname],
        },
      }
    : {}),
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      launchAutoHide: true,
      backgroundColor: "#07111C",
      showSpinner: false,
    },
    StatusBar: { style: "DARK", backgroundColor: "#07111C" },
  },
};

export default config;

