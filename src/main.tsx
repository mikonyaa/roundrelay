import { createRoot } from "react-dom/client";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./ui/styles.css";
import { App } from "./ui/App";
import { Projector } from "./projector/Projector";
createRoot(document.getElementById("root")!).render(
  location.hash.startsWith("#/projector") ? <Projector /> : <App />,
);
