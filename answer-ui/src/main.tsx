import "./zod-setup";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installBridge } from "./bridge";
import { post } from "./post";
import "./styles/theme.css";
import "./styles/page.css";
import "./styles/puzzle.css";
import { whenDrawn } from "./store";

installBridge();
createRoot(document.getElementById("root")!).render(<App />);
whenDrawn(() => post({ type: "ready" }));

if (import.meta.env.DEV) {
  const params = new URLSearchParams(location.search);
  if (params.has("f") || params.has("thread")) void import("./dev/harness").then(({ runFixture }) => runFixture(params));
}
