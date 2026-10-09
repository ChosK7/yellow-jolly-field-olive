import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { OfficeApp } from "@/game/ui/office-app";
import { boot } from "@/game/store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    boot();
    setReady(true);
  }, []);
  return <OfficeApp ready={ready} />;
}
