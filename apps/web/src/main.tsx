/** Starting point: loads fonts, styles and text, then mounts the app into <div id="root">. */
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import "./shared/text/i18n";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBackend } from "./app/backend";
import { Providers } from "./app/providers";
import { createAppRouter } from "./app/router";

const router = createAppRouter();

const root = document.getElementById("root");
if (!root) throw new Error("Missing <div id='root'> in index.html");

createRoot(root).render(
  <StrictMode>
    <Providers backend={createBackend()}>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
