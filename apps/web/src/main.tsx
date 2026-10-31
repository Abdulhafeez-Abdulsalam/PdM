/** Starting point: loads fonts, styles and text, then mounts the app into <div id="root">. */
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import "./shared/text/i18n";
import { RouterProvider } from "@tanstack/react-router";
import { setNonce } from "get-nonce";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SERVER_MODE, createBackend, createSession } from "./app/backend";
import { Providers } from "./app/providers";
import { SessionGate } from "./app/SessionGate";
import { createAppRouter } from "./app/router";

// Server mode: the page arrives with a one-time code for the Content Security Policy (ADR-0017).
// Styles the dialogs add (to stop the page behind them scrolling) carry it, so the browser allows them.
const nonce = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content;
if (nonce) setNonce(nonce);

const router = createAppRouter();

const root = document.getElementById("root");
if (!root) throw new Error("Missing <div id='root'> in index.html");

createRoot(root).render(
  <StrictMode>
    <Providers backend={createBackend()}>
      {SERVER_MODE ? (
        <SessionGate session={createSession()}>
          <RouterProvider router={router} />
        </SessionGate>
      ) : (
        <RouterProvider router={router} />
      )}
    </Providers>
  </StrictMode>,
);
