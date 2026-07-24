import "@/styles/globals.css";
import { useEffect } from "react";
import type { AppProps } from "next/app";
import AppNavigation from "../components/Navigation";

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Remove legacy plaintext Odoo credentials if still present from older builds
    try {
      localStorage.removeItem("odoo_uid");
      localStorage.removeItem("odoo_pass");
    } catch {
      // ignore (private mode / unavailable storage)
    }
  }, []);

  return (
    <>
      <AppNavigation />
      <Component {...pageProps} />
    </>
  );
}
