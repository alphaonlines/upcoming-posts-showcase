# Project Overview

This is a React-based web application that serves as a business dashboard for a furniture distributor. It provides functionalities for visualizing sales data, managing tasks, and handling social media content. The application is built with Vite, TypeScript, and Tailwind CSS. It uses Firebase for backend services like database and storage, and the Gemini API for AI-powered content generation.

# Building and Running

**Prerequisites:** Node.js

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Configure Firebase:**
    *   Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com).
    *   Register a web app and copy the configuration into `services/firebase.ts`.
    *   Enable Firestore and Storage in your Firebase project.

3.  **Set Gemini API Key:**
    *   Create a `.env.local` file in the root of the project.
    *   Add the following line to the `.env.local` file, replacing `YOUR_API_KEY` with your actual Gemini API key:
        ```
        API_KEY=YOUR_API_KEY
        ```

4.  **Run the application:**
    ```bash
    npm run dev
    ```

5.  **Deploying Cloud Functions:**
    * The `functions` directory contains a Firebase Cloud Function for processing uploaded sales data.
    * To deploy this function, you will need to have the Firebase CLI installed and configured.
    * Navigate to the `functions` directory and run:
      ```bash
      firebase deploy --only functions
      ```

# Development Conventions

*   **State Management:** The application uses React's built-in state management (`useState`, `useEffect`).
*   **Styling:** Tailwind CSS is used for styling.
*   **Components:** The application is structured into reusable React components located in the `components` directory.
*   **Services:** External services like Firebase and Gemini are abstracted into modules within the `services` directory.
*   **Types:** TypeScript types are defined in `types.ts`.
*   **Constants:** Application-wide constants are stored in `constants.ts`.
