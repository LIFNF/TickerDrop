import { useEffect } from "react";
import { Book } from "./components/Book";
import { Footer, Nav, Toasts } from "./components/Chrome";
import { Cutoff } from "./components/Cutoff";
import { Engine } from "./components/Engine";
import { Hero } from "./components/Hero";
import { Mint } from "./components/Mint";
import { Vault } from "./components/Vault";
import { useChainState, useTickers } from "./lib/data";

function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { rootMargin: "0px 0px -10% 0px" },
    );
    document.querySelectorAll(".rv").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export default function App() {
  const tickers = useTickers();
  const state = useChainState();
  useReveal();

  return (
    <>
      <Nav />
      <Hero tickers={tickers} />
      <Engine />
      <Cutoff tickers={tickers} />
      <Mint tickers={tickers} state={state} />
      <Book tickers={tickers} state={state} />
      <Vault tickers={tickers} state={state} />
      <Footer />
      <Toasts />
    </>
  );
}
