import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MercuryUI } from "./mercury-ui/MercuryUI";
import { mercuryUiDemo } from "./mercury-ui/demo";
import "./mercury-ui/mercury-ui.css";

function App() {
  const [draft, setDraft] = useState<string | null>(null);
  const [dark, setDark] = useState(false);

  return (
    <div className="demo-wrap">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
        <div>
          <h1>Mercury UI — Demo interativa</h1>
          <p className="sub">
            Renderização segura de componentes definidos por catálogo (json-render).
            Nada é enviado: formulários e botões só preparam um rascunho para revisão.
          </p>
        </div>
        <button
          type="button"
          className="mui-button"
          onClick={() => setDark((d) => !d)}
          style={{ flexShrink: 0 }}
        >
          {dark ? "Tema claro" : "Tema escuro"}
        </button>
      </div>

      <div data-theme={dark ? "dark" : "light"}>
        <MercuryUI
          raw={JSON.stringify(mercuryUiDemo)}
          onPreview={(text) => {
            setDraft(text);
            return true;
          }}
        />
      </div>

      <div className="draft-box">
        <h2>Rascunho que seria enviado ao composer</h2>
        {draft ? <pre>{draft}</pre> : <p className="empty">Clique no botão ou envie o formulário acima para ver o rascunho aqui. Nada é enviado automaticamente.</p>}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
