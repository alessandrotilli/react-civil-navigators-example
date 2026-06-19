import { NavigatorsExample } from "./navigators.ts";

import { useCallback, useRef, useState } from "react";

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const exampleRef = useRef(new NavigatorsExample());

  const loadClick = useCallback(() => {
    setLoaded(true);
    exampleRef.current.init(containerRef.current!);
  }, []);

  const disposeClick = useCallback(() => {
    setLoaded(false);
    exampleRef.current.dispose();
  }, []);

  return (
    <div className="App">
      <div className="toolbar">
        <button onClick={loaded ? disposeClick : loadClick}>
          {loaded ? "dispose" : "load"}
        </button>
      </div>
      <div className="full-screen divider">
        <div id="horizontal-menu" style={{ gridArea: "horizontal" }}></div>
        <div
          id="container"
          style={{ gridArea: "viewer" }}
          ref={containerRef}
        ></div>
      </div>
    </div>
  );
}
