import React, { useState, useEffect, useCallback } from "react";
import { api, type ProviderConfig } from "@/lib/ipc";
import { useStore } from "@/store";

/* ── Types ── */

type SettingsTab = "llm" | "appearance" | "shortcuts" | "about";

interface SidebarItem {
  key: SettingsTab;
  label: string;
  icon: React.ReactNode;
}

interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

/* ── Provider metadata (unchanged) ── */

interface ProviderMeta {
  key: string;
  label: string;
  subtitle: string;
  models: string[];
  placeholder: string;
  hint: string;
  needsKey: boolean;
  showEndpoint: boolean;
}

const PROVIDERS: ProviderMeta[] = [
  { key: "claude", label: "Anthropic (Claude)", subtitle: "Official Claude API", models: ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5-20251001"], placeholder: "sk-ant-api03-…", hint: "Get your key at console.anthropic.com", needsKey: true, showEndpoint: false },
  { key: "claude-cli", label: "Claude Code CLI (local)", subtitle: "Uses the local `claude` binary — no API key needed", models: ["claude-sonnet-4-6", "claude-opus-4-8", "claude-opus-4-7", "claude-haiku-4-5-20251001"], placeholder: "", hint: "Install: npm install -g @anthropic-ai/claude-code", needsKey: false, showEndpoint: true },
  { key: "openai", label: "OpenAI", subtitle: "GPT-4o, o3, and more", models: ["gpt-4o", "gpt-4.1", "gpt-4o-mini", "o3-mini"], placeholder: "sk-…", hint: "Get your key at platform.openai.com", needsKey: true, showEndpoint: false },
  { key: "gemini", label: "Google Gemini", subtitle: "Gemini 2.5 Flash & Pro", models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"], placeholder: "AIza…", hint: "Get your key at aistudio.google.com", needsKey: true, showEndpoint: false },
  { key: "deepseek", label: "DeepSeek", subtitle: "DeepSeek Chat & Reasoner", models: ["deepseek-chat", "deepseek-reasoner"], placeholder: "sk-…", hint: "Get your key at platform.deepseek.com", needsKey: true, showEndpoint: true },
  { key: "groq", label: "Groq", subtitle: "Ultra-fast inference", models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"], placeholder: "gsk_…", hint: "Get your key at console.groq.com", needsKey: true, showEndpoint: true },
  { key: "xai", label: "xAI (Grok)", subtitle: "Grok models", models: ["grok-3-mini", "grok-3"], placeholder: "xai-…", hint: "Get your key at console.x.ai", needsKey: true, showEndpoint: true },
  { key: "nvidia", label: "NVIDIA NIM", subtitle: "integrate.api.nvidia.com", models: ["meta/llama-3.1-70b-instruct", "nvidia/llama-3.1-nemotron-70b-instruct"], placeholder: "nvapi-…", hint: "Get your key at build.nvidia.com", needsKey: true, showEndpoint: true },
  { key: "ollama", label: "Ollama (Local)", subtitle: "Run models locally — no API key needed", models: ["llama3.1", "llama3.2", "mistral", "codellama", "deepseek-coder"], placeholder: "", hint: "Make sure Ollama is running and the model is pulled", needsKey: false, showEndpoint: true },
  { key: "codex", label: "Codex CLI (local)", subtitle: "Uses the local `codex` binary — no API key needed", models: ["codex"], placeholder: "", hint: "Install: npm install -g @openai/codex", needsKey: false, showEndpoint: true },
  { key: "azure", label: "Azure OpenAI", subtitle: "Azure OpenAI resource endpoint; Model field is the deployment name", models: [], placeholder: "your-api-key", hint: "Model field = deployment name", needsKey: true, showEndpoint: true },
  { key: "custom", label: "Custom", subtitle: "Any OpenAI- or Anthropic-compatible endpoint", models: [], placeholder: "Leave empty if no key (local models)", hint: "", needsKey: false, showEndpoint: true },
];

/* ── SVG icon helpers ── */

const BrainIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M12 2C8 2 6 4.5 6 7c-2 .5-3 2-3 4 0 2.5 2 4 4 4h1c0 2 2 3 4 3s4-1 4-3h1c2 0 4-1.5 4-4 0-2-1-3.5-3-4 0-2.5-2-5-6-5z" />
    <path d="M10 8h.01M14 8h.01M10 12c.5.5 1.5 1 2 1s1.5-.5 2-1" />
  </svg>
);
const PaletteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="8" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="8" cy="13" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="16" cy="13" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);
const KeyboardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8" />
  </svg>
);
const InfoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
  </svg>
);

/* ── Sidebar definition ── */

const SIDEBAR: SidebarSection[] = [
  {
    title: "Settings",
    items: [
      { key: "llm", label: "LLM Models", icon: <BrainIcon /> },
      { key: "appearance", label: "Appearance", icon: <PaletteIcon /> },
      { key: "shortcuts", label: "Shortcuts", icon: <KeyboardIcon /> },
      { key: "about", label: "About", icon: <InfoIcon /> },
    ],
  },
];

/* ── Reusable setting row ── */

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "14px 0", borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0, marginLeft: 16 }}>{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      width: 38, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
      padding: 3, background: on ? "var(--accent)" : "var(--border-subtle)", transition: "background .15s ease",
    }}>
      <span style={{
        display: "block", width: 16, height: 16, borderRadius: "50%", background: "var(--bg-card)",
        boxShadow: "0 1px 3px rgba(var(--shadow-color), .18)", transition: "transform .15s ease",
        transform: on ? "translateX(16px)" : "translateX(0)",
      }} />
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: 0.5,
      textTransform: "uppercase" as const, margin: "28px 0 8px", paddingTop: 8,
      borderTop: "1px solid var(--border)",
    }}>{children}</h3>
  );
}

function Badge({ children, color = "var(--bg-hover)", textColor = "var(--text-muted)" }: { children: React.ReactNode; color?: string; textColor?: string }) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 500, color: textColor, background: color,
      padding: "2px 8px", borderRadius: 8,
    }}>{children}</span>
  );
}

function ValueDisplay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 13, color: "var(--text-muted)", background: "var(--bg-surface)", padding: "5px 12px",
      borderRadius: 8, fontFamily: "ui-monospace, Menlo, monospace",
    }}>{children}</div>
  );
}


/* ══════════════════════════════════════════════════
 *  LLM MODELS PAGE
 * ══════════════════════════════════════════════════ */

function LlmModelsPage({
  active, providers, expanded, customModel, testing, cliVersion,
  onToggle, onExpand, onUpdateProvider, onTest, onCustomModel,
}: {
  active: string;
  providers: Record<string, ProviderConfig>;
  expanded: string | null;
  customModel: Record<string, boolean>;
  testing: string | null;
  cliVersion: string | null | undefined;
  onToggle: (key: string) => void;
  onExpand: (key: string) => void;
  onUpdateProvider: (key: string, field: string, value: string) => void;
  onTest: (key: string) => void;
  onCustomModel: (key: string, val: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px", lineHeight: 1.5 }}>
        One row per vendor. Toggling one on turns off the others.
        Each vendor's API key is stored independently.
      </p>
      {PROVIDERS.map((meta) => {
        const isActive = active === meta.key;
        const isExpanded = expanded === meta.key;
        const cfg = providers[meta.key] || { api_key: "", model: "", endpoint: "" };
        const hasKey = meta.key === "claude-cli" || meta.key === "codex"
          ? (meta.key === "claude-cli" ? !!cliVersion : true)
          : !meta.needsKey || cfg.api_key.length > 0;
        const isCustom = customModel[meta.key] || false;
        const selectedModel = cfg.model || meta.models[0] || "";

        return (
          <div key={meta.key} style={{
            border: "1px solid var(--border)", borderRadius: 12, background: "var(--bg-card)", overflow: "hidden",
          }}>
            {/* Row header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px" }}>
              <button onClick={() => onExpand(meta.key)} style={{
                width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                border: "none", background: "transparent", cursor: "pointer", padding: 0, flexShrink: 0,
              }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--text-muted)" strokeWidth="1.6"
                  style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s ease" }}>
                  <polyline points="5,3 9,7 5,11" />
                </svg>
              </button>
              <div style={{ flex: 1, cursor: "pointer" }} onClick={() => onExpand(meta.key)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{meta.label}</span>
                  {hasKey && (meta.needsKey || meta.key === "claude-cli" || meta.key === "codex") && <Badge>configured</Badge>}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 1 }}>{meta.subtitle}</div>
              </div>
              <button onClick={() => onToggle(meta.key)} style={{
                width: 38, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
                padding: 3, background: isActive ? "var(--accent)" : "var(--border-subtle)", transition: "background .15s ease",
                flexShrink: 0,
              }}>
                <span style={{
                  display: "block", width: 16, height: 16, borderRadius: "50%", background: "var(--bg-card)",
                  boxShadow: "0 1px 3px rgba(var(--shadow-color), .18)", transition: "transform .15s ease",
                  transform: isActive ? "translateX(16px)" : "translateX(0)",
                }} />
              </button>
            </div>

            {/* Expanded config */}
            {isExpanded && (
              <div style={{ padding: "0 20px 20px 54px", display: "flex", flexDirection: "column", gap: 18, borderTop: "1px solid var(--border)" }}>
                {/* CLI status */}
                {meta.key === "claude-cli" && (
                  <div style={{
                    marginTop: 14, borderRadius: 10, padding: "14px 16px",
                    border: "1px solid var(--border)",
                    background: cliVersion ? "var(--status-active-bg)" : "var(--bg-surface)",
                    display: "flex", flexDirection: "column", gap: 6,
                  }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>CLI status</span>
                    {cliVersion === undefined ? (
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Detecting…</span>
                    ) : cliVersion ? (
                      <span style={{ fontSize: 12.5, color: "var(--status-active-fg)", lineHeight: 1.4 }}>
                        Detected {cliVersion}. Ready to use — no API key needed.
                      </span>
                    ) : (
                      <span style={{ fontSize: 12.5, color: "var(--accent-text)", lineHeight: 1.4 }}>
                        Not found. Install: npm install -g @anthropic-ai/claude-code
                      </span>
                    )}
                  </div>
                )}

                {/* Custom: API Mode */}
                {meta.key === "custom" && (
                  <FieldBlock label="API Mode">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {(["openai", "anthropic"] as const).map((mode) => (
                        <Chip key={mode} active={(cfg.api_mode || "openai") === mode}
                          onClick={() => onUpdateProvider("custom", "api_mode", mode)}>
                          {mode === "openai" ? "OpenAI-compat" : "Anthropic-compat"}
                        </Chip>
                      ))}
                    </div>
                  </FieldBlock>
                )}

                {/* API Key */}
                {(meta.needsKey || meta.key === "custom") && (
                  <FieldBlock label="API Key">
                    <input type="password" value={cfg.api_key}
                      onChange={(e) => onUpdateProvider(meta.key, "api_key", e.target.value)}
                      placeholder={meta.key === "custom" ? "Leave empty for local models" : "Enter your API key"}
                      style={inputStyle} />
                    {meta.hint && <span style={{ fontSize: 11.5, color: "var(--text-dimmed)", marginTop: 2 }}>{meta.hint}</span>}
                  </FieldBlock>
                )}

                {/* Model */}
                <FieldBlock label="Model">
                  {meta.models.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {meta.models.map((m) => (
                        <Chip key={m} active={selectedModel === m && !isCustom} mono
                          onClick={() => { onUpdateProvider(meta.key, "model", m); onCustomModel(meta.key, false); }}>
                          {m}
                        </Chip>
                      ))}
                      <Chip active={isCustom} onClick={() => onCustomModel(meta.key, true)}
                        style={{ fontStyle: "italic", borderStyle: "dashed" }}>
                        Custom…
                      </Chip>
                    </div>
                  )}
                  <input type="text" value={selectedModel}
                    onChange={(e) => {
                      onUpdateProvider(meta.key, "model", e.target.value);
                      if (!meta.models.includes(e.target.value)) onCustomModel(meta.key, true);
                    }}
                    placeholder={meta.key === "custom" ? "e.g. gpt-4o" : meta.models[0] || "model-name"}
                    style={{ ...inputStyle, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 }} />
                </FieldBlock>

                {/* Endpoint */}
                {meta.showEndpoint && (
                  <FieldBlock label={meta.key === "claude-cli" || meta.key === "codex" ? "CLI binary path" : "Endpoint"}>
                    <input type="text" value={cfg.endpoint}
                      onChange={(e) => onUpdateProvider(meta.key, "endpoint", e.target.value)}
                      placeholder={
                        meta.key === "claude-cli" ? "claude (found on PATH)" :
                        meta.key === "codex" ? "codex (found on PATH)" :
                        meta.key === "ollama" ? "http://localhost:11434" :
                        meta.key === "custom" ? "https://your-api.example.com/v1" : "Default endpoint"
                      }
                      style={inputStyle} />
                  </FieldBlock>
                )}

                {/* Test connection */}
                <div style={{
                  background: "var(--bg-surface)", border: "1px solid var(--bg-hover)", borderRadius: 10,
                  padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6, marginTop: 4,
                }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>Provider test</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Verifies the endpoint can respond.</span>
                  <button onClick={() => onTest(meta.key)} disabled={testing === meta.key}
                    style={{
                      alignSelf: "flex-start", padding: "7px 16px", border: "1px solid var(--border)",
                      borderRadius: 8, background: "var(--bg-card)", color: "var(--text-secondary)", fontSize: 13,
                      fontWeight: 500, cursor: testing === meta.key ? "not-allowed" : "pointer",
                      marginTop: 4, fontFamily: "inherit",
                    }}>
                    {testing === meta.key ? "Testing…" : "Test connection"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Shared sub-components ── */

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 2 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginTop: 12 }}>{label}</label>
      {children}
    </div>
  );
}

function Chip({ children, active, mono, onClick, style: extra }: {
  children: React.ReactNode; active: boolean; mono?: boolean; onClick: () => void; style?: React.CSSProperties;
}) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 12px", border: active ? "1.5px solid var(--accent)" : "1px solid var(--border)",
      borderRadius: 8, fontSize: 12.5, color: active ? "var(--accent-text)" : "var(--text-secondary)",
      background: active ? "var(--accent-bg)" : "var(--bg-card)", cursor: "pointer",
      fontFamily: mono ? "ui-monospace, Menlo, monospace" : "inherit",
      fontWeight: active ? 600 : 400, whiteSpace: "nowrap", transition: "all .1s ease",
      ...extra,
    }}>{children}</button>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 9, fontSize: 14,
  color: "var(--text-primary)", background: "var(--bg-surface)", outline: "none", fontFamily: "inherit",
  boxSizing: "border-box", width: "100%",
};

/* ══════════════════════════════════════════════════
 *  APPEARANCE PAGE
 * ══════════════════════════════════════════════════ */

function AppearancePage({ compactMode, onCompactMode }: { compactMode: boolean; onCompactMode: (v: boolean) => void }) {
  const [theme, setTheme] = useState<"system" | "light" | "dark">("light");
  const accentColors = ["#BD6A47", "#5B8DEF", "#43A680", "#9B6CC4", "#D4784B", "#E05C6F"];
  const [accent, setAccent] = useState("#BD6A47");

  return (
    <>
      <SettingRow label="Theme" hint="Appearance mode">
        <div style={{ display: "flex", gap: 4, background: "var(--border)", borderRadius: 8, padding: 3 }}>
          {(["system", "light", "dark"] as const).map((t) => (
            <button key={t} onClick={() => setTheme(t)} style={{
              padding: "5px 14px", borderRadius: 6, border: "none", fontSize: 12.5, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit", transition: "all .12s ease",
              background: theme === t ? "var(--bg-card)" : "transparent",
              color: theme === t ? "var(--text-primary)" : "var(--text-muted)",
              boxShadow: theme === t ? "0 1px 3px rgba(var(--shadow-color), .1)" : "none",
            }}>
              {t === "system" ? "System" : t === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>
      </SettingRow>

      <SettingRow label="Accent color" hint="Used for buttons, toggles, and highlights">
        <div style={{ display: "flex", gap: 6 }}>
          {accentColors.map((c) => (
            <button key={c} onClick={() => setAccent(c)} style={{
              width: 24, height: 24, borderRadius: "50%", border: accent === c ? "2px solid var(--text-primary)" : "2px solid transparent",
              background: c, cursor: "pointer", padding: 0, transition: "border .1s ease",
            }} />
          ))}
        </div>
      </SettingRow>

      <SettingRow label="Font size" hint="Base font size for the app">
        <ValueDisplay>14px</ValueDisplay>
      </SettingRow>

      <SettingRow label="Sidebar width" hint="Default sidebar width in pixels">
        <ValueDisplay>260</ValueDisplay>
      </SettingRow>

      <SettingRow label="Compact mode" hint="Reduce spacing and padding">
        <Toggle on={compactMode} onChange={(v) => { onCompactMode(v); api.saveGeneralSettings({ compactMode: v }); }} />
      </SettingRow>
    </>
  );
}

function ShortcutsPage() {
  const shortcuts = [
    { keys: "⌘ K", action: "Open command palette" },
    { keys: "⌘ N", action: "New capture" },
    { keys: "⌘ B", action: "Toggle sidebar" },
    { keys: "⌘ \\", action: "Toggle detail panel" },
    { keys: "⌘ /", action: "Focus chat input" },
    { keys: "⌘ ,", action: "Open settings" },
    { keys: "Esc", action: "Close modal / Go home" },
  ];

  return (
    <>
      {shortcuts.map((s, i) => (
        <div key={i} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 0", borderBottom: i < shortcuts.length - 1 ? "1px solid var(--border)" : "none",
        }}>
          <span style={{ fontSize: 14, color: "var(--text-primary)" }}>{s.action}</span>
          <kbd style={{
            fontSize: 12, fontFamily: "ui-monospace, Menlo, monospace",
            background: "var(--border)", color: "var(--text-secondary)", padding: "3px 10px",
            borderRadius: 6, border: "1px solid var(--border)",
          }}>{s.keys}</kbd>
        </div>
      ))}
    </>
  );
}

function AboutPage() {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, background: "var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--text-on-accent)", fontSize: 20, fontWeight: 700, fontFamily: "'Newsreader', Georgia, serif",
        }}>B</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", fontFamily: "'Newsreader', Georgia, serif" }}>BrainOS</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Developer Knowledge Management</div>
        </div>
      </div>

      <SettingRow label="Version" hint="Current app version">
        <ValueDisplay>0.1.0-alpha</ValueDisplay>
      </SettingRow>
      <SettingRow label="Runtime" hint="Application framework">
        <ValueDisplay>Tauri v2</ValueDisplay>
      </SettingRow>
      <SettingRow label="License" hint="Open source license">
        <ValueDisplay>MIT</ValueDisplay>
      </SettingRow>

      <SectionTitle>Links</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8 }}>
        {[
          { label: "GitHub Repository", url: "#" },
          { label: "Documentation", url: "#" },
          { label: "Report an Issue", url: "#" },
          { label: "Changelog", url: "#" },
        ].map((link) => (
          <span key={link.label} style={{
            fontSize: 14, color: "var(--accent)", cursor: "pointer",
          }}>{link.label} →</span>
        ))}
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════
 *  MAIN SETTINGS VIEW
 * ══════════════════════════════════════════════════ */

export default function SettingsView() {
  const showToast = useStore((s) => s.showToast);
  const closeSettings = useStore((s) => s.closeSettings);

  const [tab, setTab] = useState<SettingsTab>("llm");
  const [active, setActive] = useState("claude");
  const [providers, setProviders] = useState<Record<string, ProviderConfig>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [cliVersion, setCliVersion] = useState<string | null | undefined>(undefined);
  const [compactMode, setCompactMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then((s) => {
      setActive(s.chat.active || "claude");
      setProviders(s.chat.providers || {});
      setCompactMode(s.ui.compact_mode ?? false);
      setLoaded(true);
    }).catch(() => setLoaded(true));
    api.detectClaudeCli().then(setCliVersion).catch(() => setCliVersion(null));
  }, []);

  const updateProvider = useCallback((key: string, field: string, value: string) => {
    setProviders((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }, []);

  const handleTestConnection = useCallback(async (key: string) => {
    setTesting(key);
    try {
      const resp = await api.testProvider(key, providers);
      showToast(`${key}: Connection successful — "${resp.slice(0, 40)}"`);
    } catch (e: any) {
      showToast(`${key}: ${e?.toString()?.slice(0, 80) || "Connection failed"}`);
    }
    setTesting(null);
  }, [providers, showToast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveSettings(active, providers);
      showToast("Settings saved");
    } catch {
      showToast("Failed to save settings");
    }
    setSaving(false);
  };

  if (!loaded) return null;

  const PAGE_TITLES: Record<SettingsTab, string> = {
    llm: "LLM Models",
    appearance: "Appearance",
    shortcuts: "Keyboard Shortcuts",
    about: "About",
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-surface)", borderRadius: 14 }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px", borderBottom: "1px solid var(--border)",
      }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "'Newsreader', Georgia, serif" }}>Settings</span>
        <button onClick={closeSettings} style={{
          width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
          border: "none", background: "transparent", color: "var(--text-muted)", borderRadius: 6, cursor: "pointer",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(var(--shadow-color), .06)"; e.currentTarget.style.color = "var(--text-heading)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
          title="Close (Esc)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="3" y1="3" x2="11" y2="11" /><line x1="11" y1="3" x2="3" y2="11" />
          </svg>
        </button>
      </div>

      {/* Body: sidebar + content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{
          width: 200, flexShrink: 0, borderRight: "1px solid var(--border)",
          overflowY: "auto", padding: "8px 0",
        }}>
          {SIDEBAR.map((section) => (
            <div key={section.title}>
              <div style={{
                padding: "16px 16px 6px", fontSize: 11, fontWeight: 600, color: "var(--text-dimmed)",
                letterSpacing: 0.4, textTransform: "uppercase",
              }}>{section.title}</div>
              {section.items.map((item) => {
                const isActive = tab === item.key;
                const isHovered = hoveredTab === item.key;
                return (
                  <button key={item.key} onClick={() => setTab(item.key)}
                    onMouseEnter={() => setHoveredTab(item.key)}
                    onMouseLeave={() => setHoveredTab(null)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%",
                      padding: "9px 16px", border: "none", cursor: "pointer", fontFamily: "inherit",
                      fontSize: 13.5, fontWeight: isActive ? 600 : 400,
                      color: isActive ? "var(--accent)" : isHovered ? "var(--text-secondary)" : "var(--text-muted)",
                      background: isActive ? "var(--accent-active)" : isHovered ? "rgba(var(--shadow-color), .03)" : "transparent",
                      borderRight: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                      transition: "all .1s ease",
                    }}>
                    {item.icon}
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 36px" }}>
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <h1 style={{
              fontFamily: "'Newsreader', Georgia, serif", fontSize: 24, fontWeight: 600,
              color: "var(--text-primary)", margin: "0 0 20px",
            }}>{PAGE_TITLES[tab]}</h1>

            {tab === "llm" && (
              <>
                <LlmModelsPage
                  active={active} providers={providers} expanded={expanded}
                  customModel={customModel} testing={testing} cliVersion={cliVersion}
                  onToggle={setActive} onExpand={(k) => setExpanded((p) => p === k ? null : k)}
                  onUpdateProvider={updateProvider} onTest={handleTestConnection}
                  onCustomModel={(k, v) => setCustomModel((p) => ({ ...p, [k]: v }))}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20, paddingBottom: 32 }}>
                  <button onClick={handleSave} disabled={saving} style={{
                    padding: "10px 24px", border: "none", background: "var(--accent)",
                    opacity: saving ? 0.65 : 1,
                    color: "var(--text-on-accent)", borderRadius: 10, fontSize: 14, fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
                    transition: "all .12s ease",
                  }}
                    onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = "var(--accent-hover)"; }}
                    onMouseLeave={(e) => { if (!saving) e.currentTarget.style.background = "var(--accent)"; }}
                  >
                    {saving ? "Saving…" : "Save settings"}
                  </button>
                </div>
              </>
            )}

            {tab === "appearance" && <AppearancePage compactMode={compactMode} onCompactMode={setCompactMode} />}
            {tab === "shortcuts" && <ShortcutsPage />}
            {tab === "about" && <AboutPage />}
          </div>
        </div>
      </div>
    </div>
  );
}
