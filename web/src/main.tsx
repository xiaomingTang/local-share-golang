import "./app.css";

import React from "react";
import ReactDOM from "react-dom/client";

import NiceModal from "@ebay/nice-modal-react";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

import App from "./App";
import { Toaster } from "react-hot-toast";
import { SWRConfig } from "swr";

const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#1b2636",
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
        <NiceModal.Provider>
          <CssBaseline />
          <App />
          <Toaster
            position="top-center"
            gutter={8}
            containerStyle={{ top: 18 }}
            toastOptions={{ duration: 2500 }}
          />
        </NiceModal.Provider>
      </SWRConfig>
    </ThemeProvider>
  </React.StrictMode>,
);
