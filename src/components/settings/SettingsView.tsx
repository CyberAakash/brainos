import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export function SettingsView() {
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    invoke("get_settings").then(setConfig).catch(() => {
        setConfig({
          general: { kb_root: "~/brainos", display_name: "" },
          sync: { enabled: false, remote_url: "", schedule: "0 8,22 * * *" },
          chat: { provider: "claude-cli", model: "claude-sonnet-4-6" },
          search: { embedding_model: "BAAI/bge-small-en-v1.5", rrf_k: 30 },
        });
      });
  }, []);

  if (!config) return <div className="p-6 text-zinc-400">Loading settings...</div>;

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
      <h1 className="text-xl font-bold mb-6">Settings</h1>

      <Section title="General">
        <Field label="Knowledge Base" value={config.general.kb_root} />
        <Field label="Display Name" value={config.general.display_name || "(not set)"} />
      </Section>

      <Section title="Sync (GitHub Backup)">
        <Field label="Enabled" value={config.sync.enabled ? "Yes" : "No"} />
        <Field label="Remote" value={config.sync.remote_url || "(not configured)"} />
        <Field label="Schedule" value={config.sync.schedule} />
      </Section>

      <Section title="Chat">
        <Field label="Provider" value={config.chat.provider} />
        <Field label="Model" value={config.chat.model} />
      </Section>

      <Section title="Search">
        <Field label="Embedding Model" value={config.search.embedding_model} />
        <Field label="RRF K" value={String(config.search.rrf_k)} />
      </Section>

      <div className="mt-8">
        <button className="px-4 py-2 rounded-lg bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-300 text-sm hover:bg-red-200 dark:hover:bg-red-800 transition-colors">
          Rebuild Index
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className="text-sm font-mono">{value}</span>
    </div>
  );
}
