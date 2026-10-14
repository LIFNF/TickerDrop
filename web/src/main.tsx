import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { LangProvider } from "./lib/i18n";
import { WalletProvider } from "./lib/wallet";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LangProvider>
      <WalletProvider>
        <App />
      </WalletProvider>
    </LangProvider>
  </StrictMode>,
);
