import React, { useState, useEffect, useCallback } from "react";
import { api, type ProviderConfig } from "@/lib/ipc";
import { useStore } from "@/store";

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
  {
    key: "claude",
    label: "Anthropic (Claude)",
    subtitle: "Official Claude API",
    models: ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5-20251001"],
    placeholder: "sk-ant-api03-…",
    hint: "Get your key at console.anthropic.com",
    needsKey: true,
    showEndpoint: false,
  },
  {
    key: "claude-cli",
    label: "Claude Code CLI (local)",
    subtitle: "Uses the local `claude` binary — no API key needed",
    models: ["claude-sonnet-4-6", "claude-opus-4-8", "claude-opus-4-7", "claude-haiku-4-5-20251001"],
    placeholder: "",
    hint: "Install: npm install -g @anthropic-ai/claude-code",
    needsKey: false,
    showEndpoint: true,
  },
  {
    key: "openai",
    label: "OpenAI",
    subtitle: "GPT-4o, o3, and more",
    models: ["gpt-4o", "gpt-4.1", "gpt-4o-mini", "o3-mini"],
    placeholder: "sk-…",
    hint: "Get your key at platform.openai.com",
    needsKey: true,
    showEndpoint: false,
  },
  {
    key: "gemini",
    label: "Google Gemini",
    subtitle: "Gemini 2.5 Flash & Pro",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    placeholder: "AIza…",
    hint: "Get your key at aistudio.google.com",
    needsKey: true,
    showEndpoint: false,
  },
  {
    key: "deepseek",
    label: "DeepSeek",
    subtitle: "DeepSeek Chat & Reasoner",
    models: ["deepseek-chat", "deepseek-reasoner"],
    placeholder: "sk-…",
    hint: "Get your key at platform.deepseek.com",
    needsKey: true,
    showEndpoint: true,
  },
  {
    key: "groq",
    label: "Groq",
    subtitle: "Ultra-fast inference",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    placeholder: "gsk_…",
    hint: "Get your key at console.groq.com",
    needsKey: true,
    showEndpoint: true,
  },
  {
    key: "xai",
    label: "xAI",
    subtitle: "Grok models",
    models: ["grok-3-mini", "grok-3"],
    placeholder: "xai-…",
    hint: "Get your key at console.x.ai",
    needsKey: true,
    showEndpoint: true,
  },
  {
    key: "ollama",
    label: "Ollama (Local)",
    subtitle: "Run models locally — no API key needed",
    models: ["llama3.1", "llama3.2", "mistral", "codellama", "deepseek-coder"],
    placeholder: "",
    hint: "Make sure Ollama is running and the model is pulled",
    needsKey: false,
    showEndpoint: true,
  },
  {
    key: "custom",
    label: "Custom",
    subtitle: "Any OpenAI- or Anthropic-compatible endpoint",
    models: [],
    placeholder: "Leave empty if no key (local models)",
    hint: "",
    needsKey: false, // optional key
    showEndpoint: true,
  },
];

export default function SettingsView() {
  const showToast = useStore((s) => s.showToast);
  const setMainMode = useStore((s) => s.setMainMode);

  const [active, setActive] = useState("claude");
  const [providers, setProviders] = useState<Record<string, ProviderConfig>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [cliVersion, setCliVersion] = useState<string | null | undefined>(undefined); // undefined=loading
  const [kbPath, setKbPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => {
      setActive(s.chat.active || "claude");
      setProviders(s.chat.providers || {});
      setKbPath(s.general.kb_root || "");
      setLoaded(true);
    }).catch(() => setLoaded(true));

    // Detect Claude CLI
    api.detectClaudeCli().then(setCliVersion).catch(() => setCliVersion(null));
  }, []);

  const updateProvider = useCallback((key: string, field: string, value: string) => {
    setProviders((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  }, []);

  const handleToggle = useCallback((key: string) => {
    setActive(key);
  }, []);

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => (prev === key ? null : key));
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
      showToast("Settings saved — restart app to apply");
    } catch (e) {
      showToast("Failed to save settings");
    }
    setSaving(false);
  };

  if (!loaded) return null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => setMainMode("home")} style={S.backBtn}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#4A463E"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#9A968B"; }}
        >
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <line x1="14" y1="9" x2="4" y2="9" /><polyline points="8,5 4,9 8,13" />
          </svg>
          Home
        </button>
        <span style={{ fontSize: 13, color: "#9A968B" }}>Settings</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "32px 28px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h1 style={S.pageTitle}>LLM Models</h1>
          <p style={S.pageSubtitle}>
            One row per vendor. Toggling one on automatically turns off the others.
            Each vendor's API key is stored independently so switching doesn't lose data.
          </p>

          {/* Provider rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {PROVIDERS.map((meta) => {
              const isActive = active === meta.key;
              const isExpanded = expanded === meta.key;
              const cfg = providers[meta.key] || { api_key: "", model: "", endpoint: "" };
              const hasKey = meta.key === "claude-cli"
                ? !!cliVersion
                : !meta.needsKey || cfg.api_key.length > 0;
              const isCustom = customModel[meta.key] || false;
              const selectedModel = cfg.model || meta.models[0];

              return (
                <div key={meta.key} style={{
                  border: "1px solid #E9E5DC",
                  borderRadius: 12,
                  background: "#FFFFFF",
                  overflow: "hidden",
                }}>
                  {/* Collapsed row header */}
                  <div style={S.rowHeader}>
                    <button onClick={() => toggleExpand(meta.key)} style={S.chevronBtn}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#9A968B" strokeWidth="1.6"
                        style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s ease" }}
                      >
                        <polyline points="5,3 9,7 5,11" />
                      </svg>
                    </button>

                    <div style={{ flex: 1, cursor: "pointer" }} onClick={() => toggleExpand(meta.key)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={S.providerName}>{meta.label}</span>
                        {hasKey && (meta.needsKey || meta.key === "claude-cli") && (
                          <span style={S.configuredBadge}>configured</span>
                        )}
                      </div>
                      <div style={S.providerSubtitle}>{meta.subtitle}</div>
                    </div>

                    {/* Toggle switch */}
                    <button
                      onClick={() => handleToggle(meta.key)}
                      style={{
                        ...S.toggle,
                        background: isActive ? "#BD6A47" : "#D6D1C7",
                      }}
                      title={isActive ? "Active" : "Click to activate"}
                    >
                      <span style={{
                        ...S.toggleThumb,
                        transform: isActive ? "translateX(16px)" : "translateX(0)",
                      }} />
                    </button>
                  </div>

                  {/* Expanded config */}
                  {isExpanded && (
                    <div style={S.expandedBody}>
                      {/* CLI status banner */}
                      {meta.key === "claude-cli" && (
                        <div style={{
                          ...S.testBlock,
                          marginTop: 14,
                          borderColor: cliVersion ? "#C5DFA8" : "#E7E1D6",
                          background: cliVersion ? "#F2F9E8" : "#FAF8F3",
                        }}>
                          <span style={S.testTitle}>CLI status</span>
                          {cliVersion === undefined ? (
                            <span style={S.testHint}>Detecting…</span>
                          ) : cliVersion ? (
                            <>
                              <span style={{ fontSize: 12.5, color: "#4A7C1B", lineHeight: 1.4 }}>
                                Detected {cliVersion}. Ready to use your local subscription — no API key needed.
                              </span>
                              <span style={{ ...S.fieldHint, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11.5 }}>
                                {/* Path will vary, just show it's detected */}
                                If chat fails with an auth error, run `claude` in a terminal to refresh the OAuth login.
                              </span>
                            </>
                          ) : (
                            <span style={{ fontSize: 12.5, color: "#9A6840", lineHeight: 1.4 }}>
                              Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code
                            </span>
                          )}
                        </div>
                      )}

                      {/* Custom: API Mode selector */}
                      {meta.key === "custom" && (
                        <div style={S.fieldBlock}>
                          <label style={S.fieldLabel}>API Mode</label>
                          <div style={S.chipRow}>
                            {["openai", "anthropic"].map((mode) => (
                              <button
                                key={mode}
                                onClick={() => updateProvider("custom", "api_mode", mode)}
                                style={{
                                  ...S.chip,
                                  fontFamily: "inherit",
                                  ...((cfg.api_mode || "openai") === mode ? S.chipActive : {}),
                                }}
                              >
                                {mode === "openai" ? "OpenAI-compat" : "Anthropic-compat"}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* API Key — shown for needsKey providers OR custom */}
                      {(meta.needsKey || meta.key === "custom") && (
                        <div style={S.fieldBlock}>
                          <label style={S.fieldLabel}>API Key</label>
                          <input
                            type="password"
                            value={cfg.api_key}
                            onChange={(e) => updateProvider(meta.key, "api_key", e.target.value)}
                            placeholder={meta.key === "custom" ? "Leave empty if no key (local models)" : "Enter your API key"}
                            style={S.input}
                          />
                          {meta.hint && <span style={S.fieldHint}>{meta.hint}</span>}
                        </div>
                      )}

                      {/* Model */}
                      <div style={S.fieldBlock}>
                        <label style={S.fieldLabel}>Model</label>
                        {meta.models.length > 0 && (
                          <div style={S.chipRow}>
                            {meta.models.map((m) => (
                              <button
                                key={m}
                                onClick={() => {
                                  updateProvider(meta.key, "model", m);
                                  setCustomModel((p) => ({ ...p, [meta.key]: false }));
                                }}
                                style={{
                                  ...S.chip,
                                  ...(selectedModel === m && !isCustom ? S.chipActive : {}),
                                }}
                              >
                                {m}
                              </button>
                            ))}
                            <button
                              onClick={() => setCustomModel((p) => ({ ...p, [meta.key]: true }))}
                              style={{
                                ...S.chip,
                                ...S.chipCustom,
                                ...(isCustom ? S.chipActive : {}),
                              }}
                            >
                              Custom…
                            </button>
                          </div>
                        )}
                        <input
                          type="text"
                          value={selectedModel}
                          onChange={(e) => {
                            updateProvider(meta.key, "model", e.target.value);
                            if (!meta.models.includes(e.target.value)) {
                              setCustomModel((p) => ({ ...p, [meta.key]: true }));
                            }
                          }}
                          placeholder={meta.key === "custom" ? "e.g. gpt-4o" : meta.models[0]}
                          style={{ ...S.input, marginTop: meta.models.length > 0 ? 8 : 0, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 }}
                        />
                      </div>

                      {/* Endpoint */}
                      {meta.showEndpoint && (
                        <div style={S.fieldBlock}>
                          <label style={S.fieldLabel}>
                            {meta.key === "claude-cli" ? "CLI binary path" : "Endpoint"}
                          </label>
                          <input
                            type="text"
                            value={cfg.endpoint}
                            onChange={(e) => updateProvider(meta.key, "endpoint", e.target.value)}
                            placeholder={
                              meta.key === "claude-cli" ? "claude (found on PATH)" :
                              meta.key === "ollama" ? "http://localhost:11434" :
                              meta.key === "custom" ? "https://your-api.example.com/v1" : "Default endpoint"
                            }
                            style={S.input}
                          />
                        </div>
                      )}

                      {/* Test connection */}
                      <div style={S.testBlock}>
                        <span style={S.testTitle}>Provider test</span>
                        <span style={S.testHint}>
                          Verifies the endpoint can respond.
                        </span>
                        <button
                          onClick={() => handleTestConnection(meta.key)}
                          disabled={testing === meta.key}
                          style={S.testBtn}
                        >
                          {testing === meta.key ? "Testing…" : "Test connection"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Knowledge Base */}
          <div style={{
            border: "1px solid #E9E5DC",
            borderRadius: 12,
            background: "#FFFFFF",
            padding: "20px 24px",
            marginBottom: 16,
          }}>
            <h2 style={S.sectionTitle}>Knowledge Base</h2>
            <div style={S.fieldBlock}>
              <label style={S.fieldLabel}>Path</label>
              <div style={{
                ...S.input,
                background: "#FAF8F3",
                color: "#7C7468",
                cursor: "default",
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 12.5,
              }}>
                {kbPath || "~/knowledge-base"}
              </div>
              <span style={S.fieldHint}>
                Edit config.toml to change KB path (restart required)
              </span>
            </div>
          </div>

          {/* Save */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20, paddingBottom: 32 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "10px 24px",
                border: "none",
                background: saving ? "#C9A08D" : "#BD6A47",
                color: "#FFF",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                transition: "all .12s ease",
              }}
              onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.background = "#A85B3B"; }}
              onMouseLeave={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.background = "#BD6A47"; }}
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Styles ── */

const S: Record<string, React.CSSProperties> = {
  header: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 28px",
    borderBottom: "1px solid #E9E5DC",
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    border: "none",
    background: "transparent",
    color: "#9A968B",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
  },
  pageTitle: {
    fontFamily: "'Newsreader', Georgia, serif",
    fontSize: 28,
    fontWeight: 600,
    color: "#21201C",
    margin: "0 0 8px",
  },
  pageSubtitle: {
    fontSize: 13.5,
    color: "#9A968B",
    lineHeight: 1.5,
    margin: "0 0 24px",
  },
  sectionTitle: {
    fontFamily: "'Newsreader', Georgia, serif",
    fontSize: 17,
    fontWeight: 600,
    color: "#21201C",
    margin: "0 0 14px",
  },

  /* Row header */
  rowHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 20px",
  },
  chevronBtn: {
    width: 22,
    height: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
  },
  providerName: {
    fontSize: 15,
    fontWeight: 600,
    color: "#21201C",
  },
  providerSubtitle: {
    fontSize: 12.5,
    color: "#9A968B",
    marginTop: 1,
  },
  configuredBadge: {
    fontSize: 10.5,
    fontWeight: 500,
    color: "#7C7468",
    background: "#EDE9E0",
    padding: "2px 8px",
    borderRadius: 8,
  },

  /* Toggle */
  toggle: {
    width: 38,
    height: 22,
    borderRadius: 11,
    border: "none",
    cursor: "pointer",
    padding: 3,
    transition: "background .15s ease",
    flexShrink: 0,
    position: "relative" as const,
  },
  toggleThumb: {
    display: "block",
    width: 16,
    height: 16,
    borderRadius: "50%",
    background: "#FFFFFF",
    boxShadow: "0 1px 3px rgba(0,0,0,.18)",
    transition: "transform .15s ease",
  },

  /* Expanded body */
  expandedBody: {
    padding: "0 20px 20px 54px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 18,
    borderTop: "1px solid #F0ECE4",
  },
  fieldBlock: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 5,
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "#21201C",
    marginTop: 12,
  },
  fieldHint: {
    fontSize: 11.5,
    color: "#A8A398",
    marginTop: 2,
  },
  input: {
    padding: "9px 12px",
    border: "1px solid #E7E1D6",
    borderRadius: 9,
    fontSize: 14,
    color: "#21201C",
    background: "#FAF8F3",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box" as const,
    width: "100%",
  },

  /* Model chips */
  chipRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
    marginTop: 4,
  },
  chip: {
    padding: "5px 12px",
    border: "1px solid #E7E1D6",
    borderRadius: 8,
    fontSize: 12.5,
    fontFamily: "ui-monospace, Menlo, monospace",
    color: "#56524A",
    background: "#FFFFFF",
    cursor: "pointer",
    transition: "all .1s ease",
    whiteSpace: "nowrap" as const,
  },
  chipActive: {
    border: "1.5px solid #BD6A47",
    background: "#FBF3EE",
    color: "#9A4F30",
    fontWeight: 600,
  },
  chipCustom: {
    fontFamily: "inherit",
    fontStyle: "italic" as const,
    borderStyle: "dashed" as const,
  },

  /* Test connection */
  testBlock: {
    background: "#FAF8F3",
    border: "1px solid #EDE9E0",
    borderRadius: 10,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    marginTop: 4,
  },
  testTitle: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "#21201C",
  },
  testHint: {
    fontSize: 12,
    color: "#9A968B",
    lineHeight: 1.4,
  },
  testBtn: {
    alignSelf: "flex-start",
    padding: "7px 16px",
    border: "1px solid #E7E1D6",
    borderRadius: 8,
    background: "#FFFFFF",
    color: "#56524A",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    marginTop: 4,
    transition: "all .1s ease",
  },
};
