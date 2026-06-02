const pkg = require('./package.json');

module.exports = {
    expo: {
        name: 'Unimate',
        slug: 'unimate',
        scheme: 'unimate',
        version: pkg.version,
        orientation: 'portrait',
        icon: './assets/icon.png',
        userInterfaceStyle: 'light',
        newArchEnabled: true,
        splash: {
            image: './assets/splash-icon.png',
            resizeMode: 'contain',
            backgroundColor: '#ffffff'
        },
        ios: {
            supportsTablet: true,
            bundleIdentifier: 'com.beelal.unimate',
            infoPlist: {
                NSAppTransportSecurity: {
                    NSAllowsLocalNetworking: true,
                    NSAllowsArbitraryLoadsInWebContent: false,
                },
            },
        },
        android: {
            adaptiveIcon: {
                foregroundImage: './assets/android-icon-foreground.png',
                monochromeImage: './assets/android-icon-monochrome.png',
                backgroundColor: '#ffffff'
            },
            package: 'com.beelal.unimate',
            usesCleartextTraffic: true,
            permissions: ['SCHEDULE_EXACT_ALARM', 'android.permission.REQUEST_INSTALL_PACKAGES'],
        },
        web: {
            favicon: './assets/favicon.png'
        },
        plugins: [
            'expo-router',
            [
                'expo-splash-screen',
                {
                    image: './assets/splash-icon.png',
                    imageWidth: 200,
                    resizeMode: 'contain',
                    backgroundColor: '#ffffff'
                }
            ],
            'expo-font',
            [
                'expo-notifications',
                {
                    color: '#0A0A0A'
                }
            ]
        ],
        experiments: {
            typedRoutes: true
        },
        extra: {
            posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
            apkFallbackUrl: process.env.EXPO_PUBLIC_APK_FALLBACK_URL,
            eas: {
                projectId: "f7bd96c9-6536-4266-9047-dbe2cd09866d"
            }
        }
    }
};
