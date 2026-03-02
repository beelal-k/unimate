# 🎓 UniMate [You-nee-mate]

*Note: This application was 100% vibe coded. ✨*

UniMate is an all-in-one open-source companion app designed to help students organize their academic life. It brings together your class schedule, offline files, AI assistance, and automatic Moodle LMS assignment tracking into one beautiful, native mobile experience.

---

## 🚀 Features
* **📅 Smart Schedule:** A horizontally-scrolling, beautiful weekly grid with automated push notifications before your classes start.
* **📚 Moodle Sync:** Connect your university Moodle account to automatically pull down upcoming assignments, grades, and offline reading materials.
* **📂 Local File Manager:** Keep your PDFs, slides, and images in one place with instant search and sorting.
* **🤖 AI Companion:** Stuck on a concept? Attach your course materials and chat with Gemini for instant, context-aware help.

## 🛠️ Tech Stack
This project is built using modern tooling for cross-platform performance and offline-first reliability:
* **Framework:** [React Native](https://reactnative.dev/) with [Expo](https://expo.dev/)
* **Routing:** Expo Router
* **State Management:** Zustand
* **Database:** SQLite (local persistence) with Drizzle ORM
* **Styling & Animations:** NativeWind / UI Reanimated
* **AI Engine:** Google Gemini (`@google/genai`)

## 💻 Local Setup & Development

### 1. Prerequisites
Ensure you have the following installed on your machine:
* [Node.js](https://nodejs.org/en/) (v18 or newer recommended)
* Git
* An iOS Simulator (via Xcode) or Android Emulator (via Android Studio), or the [Expo Go](https://expo.dev/client) app on your physical device.

### 2. Installation
Clone the repository and install the dependencies:
```bash
git clone https://github.com/your-username/unimate.git
cd unimate
npm install
```

### 3. Environment Variables
To enable the AI Chat, you will need a Google Gemini API key.
1. Create a `.env` file in the root directory.
2. Add your API key:
```env
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Running the App
Start the Expo development server:
```bash
npx expo start
```
From the terminal menu, you can press:
- `i` to open in the iOS Simulator.
- `a` to open in the Android Emulator.
- Or scan the QR code with the Expo Go app on your phone.

---

## 🤝 Contributing
Contributions are always welcome! Whether it's adding new features, fixing bugs, or improving UI/UX. 
1. Fork the project.
2. Create a feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request!
