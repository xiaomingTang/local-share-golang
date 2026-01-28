import "./app.css";

import React from "react";
import ReactDOM from "react-dom/client";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

import App from "./App";
import { Toaster } from "react-hot-toast";
import { SWRConfig } from "swr";

const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#1b2636",
      paper: "rgba(255, 255, 255, 0.06)",
    },
  },
  typography: {
    button: {
      textTransform: "none",
    },
  },
});

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <SWRConfig
        value={{ revalidateOnFocus: false, shouldRetryOnError: false }}
      >
        <CssBaseline />
        <App />
        <Toaster
          position="top-center"
          gutter={8}
          containerStyle={{ top: 18 }}
          toastOptions={{ duration: 2500 }}
        />
      </SWRConfig>
    </ThemeProvider>
  </React.StrictMode>,
);
