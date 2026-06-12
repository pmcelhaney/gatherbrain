# 0001 — Project Setup

## Summary

As a developer, I want a working TypeScript project scaffold so that I can begin implementing the app.

## Details

Initialize the project as a web application using the **File System Access API** for local-first file access. The app will run entirely in the browser with no server-side component.

### Requirements

- Initialize `package.json` with a project name, description, and scripts.
- Configure TypeScript (`tsconfig.json`) with strict mode enabled.
- Add a bundler (Vite is preferred for its speed and simplicity).
- Add a minimal `index.html` entry point.
- Add a minimal `src/main.ts` entry point.
- Add a `src/` directory structure:
  ```
  src/
    main.ts
    types/
    store/
    schema/
    query/
    elements/
    services/
  ```
- Add ESLint and Prettier configuration files (use sensible defaults).
- Add scripts to `package.json`:
  - `dev` — start development server
  - `build` — production build
  - `lint` — run ESLint
  - `format` — run Prettier
- Create a basic `README.md` documenting how to run the project.

### Acceptance Criteria

- `npm run dev` starts the development server without errors.
- `npm run build` produces a production build without errors.
- The app displays a placeholder heading in the browser (e.g., "GatherBrain").
- TypeScript strict mode is enabled and there are no type errors.
