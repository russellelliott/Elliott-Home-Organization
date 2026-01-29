# Elliott Home Organization

A Next.js application designed to organize the various physical and virtual media of the Elliott household, which among other things, would involve cataloging books by scanning images of bookshelves.

## Project Structure

The project works in tandem with a specific folder structure for organizing images. Images are sourced from a `Library Images` folder located immediately outside the project root. This folder is organized by room:

```
../Library Images/
├── Espana Ct Office/
└── Santa Cruz Cottage/
```

The application scans these directories to find bookshelf images to process.

## Configuration

This application relies on two external APIs:

1.  **Google Gemini API** (`GEMINI_API_KEY`): Used in the backend (`pages/api/scan-shelf.js`) to analyze images and identify book titles/authors.
2.  **Perplexity API** (`PERPLEXITY_API_KEY`): Used in the backend (`pages/api/enrich-book.js`) to enrich the book data with details like ISBN, publisher, and publication year.

Ensure these keys are defined in your environment variables (`.env` or `.env.local`) for the application to function correctly.

Google Drive: https://drive.google.com/drive/u/0/folders/1urR9SDoRMd7VVGb4Uy1K-2HVrme9WmEC

Firebase: https://console.firebase.google.com/u/0/project/elliott-home-organization/overview

## Running the Application

This application is designed to be **hosted locally**. It relies on access to the local file system to scan the library images.

To run the application:

1.  Start the development server:
    ```bash
    npm run dev
    ```
2.  Open your browser and navigate to [http://localhost:3000](http://localhost:3000).
