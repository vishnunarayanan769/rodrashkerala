# Road Rash Kerala — God's Own Mayhem

> Brawl, boost, and race through God's Own Country.

Road Rash Kerala is an action-packed web-based racing game inspired by classic vehicular combat, set against the vibrant backdrop of Kerala. Built with modern web technologies, it features real-time multiplayer networking and a fast-paced aesthetic.

## Features

- **High-Speed Racing**: Navigate through dynamic tracks.
- **Vehicular Combat**: Brawl your way to the front of the pack.
- **Multiplayer**: Play against others in real-time utilizing PeerJS for peer-to-peer connections.
- **Modern UI**: Styled with Tailwind CSS v4 and specialized typography (Bungee, Noto Sans Malayalam, Rajdhani).
- **Smooth Performance**: Powered by React 19 and Vite.

## Tech Stack

- **Framework**: [React 19](https://react.dev/) for building the user interface.
- **Bundler**: [Vite](https://vitejs.dev/) for fast development and building.
- **Build Plugin**: `vite-plugin-singlefile` to bundle the entire game into a single HTML file for easy distribution.
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) for utility-first styling.
- **Styling Utilities**: `clsx` and `tailwind-merge` for conditionally merging tailwind classes without conflicts.
- **Language**: TypeScript for static type checking.
- **Networking**: [PeerJS](https://peerjs.com/) for WebRTC peer-to-peer multiplayer connectivity.
- **Typography**: Specialized fonts including [Bungee](https://fontsource.org/fonts/bungee), [Noto Sans Malayalam](https://fontsource.org/fonts/noto-sans-malayalam), and [Rajdhani](https://fontsource.org/fonts/rajdhani) loaded via `@fontsource`.

## Project Structure

```text
├── src/
│   ├── components/  # React components for the UI
│   ├── game/        # Core game logic, physics, and rendering
│   ├── utils/       # Utility functions and helpers
│   ├── App.tsx      # Main application component
│   ├── main.tsx     # Application entry point
│   └── index.css    # Global styles and Tailwind configuration
├── package.json     # Project dependencies and scripts
└── vite.config.ts   # Vite configuration including single-file plugin
```

## Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. Clone the repository and navigate to the project folder.
2. Install the dependencies:
   ```bash
   npm install
   ```

### Development

To start the development server:

```bash
npm run dev
```

This will run the application in development mode with hot-module replacement. Open [http://localhost:5173](http://localhost:5173) to view it in your browser.

### Building for Production

To create a production-ready build:

```bash
npm run build
```

You can then preview the production build locally:

```bash
npm run preview
```

## License

This project is intended for personal and educational purposes.
