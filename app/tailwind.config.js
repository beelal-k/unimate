/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./app/**/*.{js,jsx,ts,tsx}",
        "./components/**/*.{js,jsx,ts,tsx}",
    ],
    presets: [require("nativewind/preset")],
    theme: {
        extend: {
            colors: {
                base: {
                    DEFAULT: '#FFFFFF',
                    dark: '#0A0A0A',
                },
                subtle: {
                    DEFAULT: '#F9F9F9',
                    dark: '#111111',
                },
                surface: {
                    DEFAULT: '#FFFFFF',
                    dark: '#161616',
                },
                elevated: {
                    DEFAULT: '#F3F3F3',
                    dark: '#1E1E1E',
                },
                inverse: {
                    DEFAULT: '#0A0A0A',
                    dark: '#F5F5F5',
                },
                'border-subtle': {
                    DEFAULT: '#F0F0F0',
                    dark: '#2A2A2A',
                },
                'border-default': {
                    DEFAULT: '#E4E4E4',
                    dark: '#3A3A3A',
                },
                'border-strong': {
                    DEFAULT: '#C0C0C0',
                    dark: '#505050',
                },
                'text-primary': {
                    DEFAULT: '#0A0A0A',
                    dark: '#F5F5F5',
                },
                'text-secondary': {
                    DEFAULT: '#6E6E6E',
                    dark: '#888888',
                },
                'text-tertiary': {
                    DEFAULT: '#A0A0A0',
                    dark: '#555555',
                },
                'text-inverse': {
                    DEFAULT: '#FFFFFF',
                    dark: '#0A0A0A',
                },
                'accent-overdue': '#EF4444',
                'accent-warning': '#999999',
                'accent-done': '#BBBBBB',
            },
            fontFamily: {
                'inter-regular': ['Inter_400Regular'],
                'inter-medium': ['Inter_500Medium'],
                'inter-semibold': ['Inter_600SemiBold'],
                'inter-bold': ['Inter_700Bold'],
            },
            fontSize: {
                'display': ['32px', { lineHeight: '38.4px', letterSpacing: '-0.5px', fontWeight: '700' }],
                'h1': ['24px', { lineHeight: '36px', letterSpacing: '-0.5px', fontWeight: '600' }],
                'h2': ['18px', { lineHeight: '27px', fontWeight: '600' }],
                'h3': ['15px', { lineHeight: '22.5px', fontWeight: '500' }],
                'body': ['15px', { lineHeight: '22.5px', fontWeight: '400' }],
                'body-sm': ['13px', { lineHeight: '19.5px', fontWeight: '400' }],
                'label': ['12px', { lineHeight: '18px', fontWeight: '500' }],
                'caption': ['11px', { lineHeight: '16.5px', fontWeight: '400' }],
            },
            spacing: {
                '4.5': '18px',
                '13': '52px',
                '15': '60px',
                '17': '68px',
            },
            borderRadius: {
                'card': '16px',
                'button': '12px',
                'input': '10px',
            },
        },
    },
    plugins: [],
};
