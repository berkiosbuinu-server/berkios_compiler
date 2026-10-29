// Berkios AI bridge for the static playground.
const API_BASE = (new URLSearchParams(location.search).get("berkiosAI") || "https://api.berkios.online").replace(/\/+$/, "");
const $ = (id) => document.getElementById(id);
const toggle = $("berkios-ai-toggle"), panel = $("berkios-ai-panel");
const promptEl = $("berkios-ai-prompt"), statusEl = $("berkios-ai-status");
const answerEl = $("berkios-ai-answer"), send = $("berkios-ai-send"), apply = $("berkios-ai-apply");
let proposedCode = "";
function openPanel(open) { panel.hidden = !open; toggle.setAttribute("aria-expanded", String(open)); if (open) promptEl.focus(); }
toggle?.addEventListener("click", () => openPanel(panel.hidden));
$("berkios-ai-close")?.addEventListener("click", () => openPanel(false));
function currentKind() {
  const first = ($("code")?.value || "").split(/\r?\n/).map(x => x.trim()).find(x => x && !x.startsWith("//") && !x.startsWith("#")) || "";
  return /^(langue|language|lugha|idioma)\b/i.test(first) ? ".bk" : ".bks";
}
function compilerDiagnostics() {
  return { status: $("status")?.textContent || "", diagnostics: [...($("diags")?.querySelectorAll("li") || [])].map(x => x.textContent.trim()).filter(Boolean) };
}
function extractCode(text) {
  const blocks = [...text.matchAll(/```(?:bk|bks|berkios|text)?\s*\n([\s\S]*?)```/gi)];
  return blocks.map(m => m[1].trim()).filter(Boolean).sort((a,b) => b.length-a.length)[0] || "";
}
send?.addEventListener("click", async () => {
  const question = promptEl.value.trim();
  if (!question) { statusEl.textContent = "Écrivez une demande à Berkios AI."; return; }
  send.disabled = true; apply.hidden = true; proposedCode = ""; statusEl.textContent = "Berkios AI réfléchit…"; answerEl.textContent = "";
  const source = $("berkios-ai-include-code").checked ? ($("code")?.value || "") : "";
  const kind = currentKind();
  const context = [
    "Tu es Berkios AI, assistant expert de l'écosystème BERKIOS.",
    "Respecte la différence entre .bk (langage déclaratif multilingue) et .bks (BERKIOS Core typé).",
    "N'invente pas de composants, mots-clés ou fonctions. Base-toi sur le code et les diagnostics fournis.",
    "Si tu proposes du code, utilise un bloc Markdown ```bk ou ```bks approprié, et explique brièvement les changements.",
    `Type détecté : ${kind}.`, `État du compilateur : ${JSON.stringify(compilerDiagnostics())}`,
    source ? `Code source actuel (${kind}):\n${source}` : "Le code source n'a pas été inclus."
  ].join("\n\n");
  try {
    const response = await fetch(`${API_BASE}/v1/agent/run`, { method:"POST", headers:{"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify({request:`${context}\n\nDemande du développeur :\n${question}`,active_file:source?{name:kind===".bk"?"main.bk":"main.bks",content:source,language:kind.slice(1)}:null,selection:window.getSelection()?.toString()||"",max_iterations:2}) });
    const raw = await response.text(); let data; try { data=JSON.parse(raw); } catch { data={detail:raw}; }
    if (!response.ok) throw new Error(data.detail || data.error || `Erreur HTTP ${response.status}`);
    const result=data.result??data.output??data.response??data.message??data;
    const answer=typeof result==="string"?result:JSON.stringify(result,null,2);
    answerEl.textContent=answer; proposedCode=extractCode(answer); apply.hidden=!proposedCode;
    statusEl.textContent="Réponse reçue. Vérifiez le code avant de l'utiliser.";
  } catch(error) { statusEl.textContent=`Impossible de contacter Berkios AI : ${error?.message||error}. Vérifiez l'API et sa configuration CORS.`; }
  finally { send.disabled=false; }
});
apply?.addEventListener("click", () => {
  if (!proposedCode || !confirm("Remplacer le contenu de l'éditeur par le code proposé par Berkios AI ?")) return;
  const editor=$("code"); editor.value=proposedCode; editor.dispatchEvent(new Event("input",{bubbles:true}));
  statusEl.textContent="Code appliqué à l'éditeur. Vérifiez les diagnostics du compilateur."; apply.hidden=true;
});
