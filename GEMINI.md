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

# Troubleshooting: Storage upload succeeds, but no Firestore collections appear

The Firestore collections (`stores`, `sales_transactions`) are created by the Cloud Function `importSalesXlsx` when it runs successfully.

Checklist:

1. **Confirm the upload path and file type**
   - The function only processes Excel files (`.xlsx` / `.xls`) uploaded under the `sales/` folder in your Firebase Storage bucket (example: `sales/weekly-sales.xlsx`).

2. **Confirm the function is deployed to the right Firebase project**
   - Make sure you’re deploying to the project you’re looking at in the Firebase Console (`.firebaserc` sets the default project).
   - Deploy again: `cd functions && firebase deploy --only functions`

3. **Check function logs**
   - Run: `cd functions && npm run logs`
   - Look for `importSalesXlsx triggered` and `Import complete`.
   - If you see “Skipping…”, the file path or file type didn’t match what the function expects.

4. **Confirm the spreadsheet column headers match**
   - The importer expects these exact column names (case-sensitive) in the Excel sheet:
     - `Date of Sale`
     - `Sales Location`
     - `Sales Person`
     - `Sales#`
   - If headers don’t match, every row can be skipped, resulting in no Firestore writes.

5. **Ensure you’re not mixing emulator vs production**
   - If you run emulators locally, uploads to production Storage won’t trigger your local emulator function, and emulator Firestore won’t show data from production.

# Development Conventions

*   **State Management:** The application uses React's built-in state management (`useState`, `useEffect`).
*   **Styling:** Tailwind CSS is used for styling.
*   **Components:** The application is structured into reusable React components located in the `components` directory.
*   **Services:** External services like Firebase and Gemini are abstracted into modules within the `services` directory.
*   **Types:** TypeScript types are defined in `types.ts`.
*   **Constants:** Application-wide constants are stored in `constants.ts`.
