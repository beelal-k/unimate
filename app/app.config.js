module.exports = {
    expo: {
        name: 'Unimate',
        slug: 'unimate',
        scheme: 'unimate',
        version: '1.0.0',
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
                backgroundColor: '#ffffff'
            },
            package: 'com.beelal.unimate',
            usesCleartextTraffic: true,
            permissions: ['SCHEDULE_EXACT_ALARM'],
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
            'expo-font'
        ],
        experiments: {
            typedRoutes: true
        },
        extra: {
            tursoUrl: process.env.TURSO_URL,
            tursoToken: process.env.TURSO_AUTH_TOKEN,
            eas: {
                projectId: "f7bd96c9-6536-4266-9047-dbe2cd09866d"
            }
        }
    }
};
