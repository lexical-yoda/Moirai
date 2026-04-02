"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Check, Loader2, X, Wifi, Bot, Mic, Sparkles, Shield, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/lib/auth/client";

const PROVIDERS = [
  { value: "llama-server", label: "llama-server", defaultUrl: "http://localhost:8080" },
  { value: "ollama", label: "Ollama", defaultUrl: "http://localhost:11434" },
  { value: "lm-studio", label: "LM Studio", defaultUrl: "http://localhost:1234" },
  { value: "openai-compatible", label: "OpenAI Compatible", defaultUrl: "" },
];

type TestResult = { ok: boolean; error?: string; modelLoaded?: boolean | null } | null;

function TestBadge({ result, testing }: { result: TestResult; testing: boolean }) {
  if (testing) return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Testing...</span>;
  if (!result) return null;
  if (result.ok) return <span className="flex items-center gap-1 text-xs text-green-600"><Check className="h-3 w-3" /> Connected</span>;
  return <span className="flex items-center gap-1 text-xs text-destructive"><X className="h-3 w-3" /> {result.error}</span>;
}

interface UserInfo {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);

  // AI settings
  const [aiProvider, setAiProvider] = useState("llama-server");
  const [aiEndpointUrl, setAiEndpointUrl] = useState("");
  const [aiModelName, setAiModelName] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiTest, setAiTest] = useState<TestResult>(null);
  const [aiTesting, setAiTesting] = useState(false);

  // Embedding settings
  const [embeddingEndpointUrl, setEmbeddingEndpointUrl] = useState("");
  const [embeddingModelName, setEmbeddingModelName] = useState("");
  const [embeddingTest, setEmbeddingTest] = useState<TestResult>(null);
  const [embeddingTesting, setEmbeddingTesting] = useState(false);

  // Whisper settings
  const [whisperEndpointUrl, setWhisperEndpointUrl] = useState("");
  const [whisperTest, setWhisperTest] = useState<TestResult>(null);
  const [whisperTesting, setWhisperTesting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        if (data.aiProvider) setAiProvider(data.aiProvider);
        if (data.aiEndpointUrl) setAiEndpointUrl(data.aiEndpointUrl);
        if (data.aiModelName) setAiModelName(data.aiModelName);
        if (data.aiApiKey) setAiApiKey(data.aiApiKey);
        if (data.embeddingEndpointUrl) setEmbeddingEndpointUrl(data.embeddingEndpointUrl);
        if (data.embeddingModelName) setEmbeddingModelName(data.embeddingModelName);
        if (data.whisperEndpointUrl) setWhisperEndpointUrl(data.whisperEndpointUrl);
      } finally {
        setLoading(false);
      }

      // Load admin data if admin
      try {
        const regRes = await fetch("/api/admin/registration");
        if (regRes.ok) {
          const regData = await regRes.json();
          setIsAdmin(true);
          setRegistrationOpen(regData.open);
          const usersRes = await fetch("/api/admin/users");
          if (usersRes.ok) setAllUsers(await usersRes.json());
        }
      } catch {}
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiProvider, aiEndpointUrl, aiModelName, aiApiKey,
          embeddingEndpointUrl, embeddingModelName, whisperEndpointUrl,
        }),
      });
      if (res.ok) toast.success("Settings saved");
      else toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function testAiConnection() {
    setAiTesting(true); setAiTest(null);
    try {
      const res = await fetch("/api/settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpointUrl: aiEndpointUrl, apiKey: aiApiKey }),
      });
      setAiTest(await res.json());
    } catch { setAiTest({ ok: false, error: "Request failed" }); }
    finally { setAiTesting(false); }
  }

  async function testEmbeddingConnection() {
    setEmbeddingTesting(true); setEmbeddingTest(null);
    const url = embeddingEndpointUrl || aiEndpointUrl;
    try {
      const res = await fetch("/api/settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpointUrl: url, apiKey: aiApiKey }),
      });
      setEmbeddingTest(await res.json());
    } catch { setEmbeddingTest({ ok: false, error: "Request failed" }); }
    finally { setEmbeddingTesting(false); }
  }

  async function testWhisperConnection() {
    setWhisperTesting(true); setWhisperTest(null);
    try {
      const res = await fetch("/api/settings/test-whisper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpointUrl: whisperEndpointUrl }),
      });
      setWhisperTest(await res.json());
    } catch { setWhisperTest({ ok: false, error: "Request failed" }); }
    finally { setWhisperTesting(false); }
  }

  function handleProviderChange(provider: string) {
    setAiProvider(provider);
    const p = PROVIDERS.find((p) => p.value === provider);
    if (p?.defaultUrl) setAiEndpointUrl(p.defaultUrl);
    setAiTest(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      <p className="text-muted-foreground">
        Configure external services. The app works without these — AI features activate once endpoints are configured.
      </p>

      {/* AI / LLM */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" /> AI / LLM</CardTitle>
          <CardDescription>
            Powers mood analysis, insight extraction, and reflections
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <div className="flex flex-wrap gap-2">
              {PROVIDERS.map((p) => (
                <Button key={p.value} variant={aiProvider === p.value ? "default" : "outline"} size="sm" onClick={() => handleProviderChange(p.value)}>
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-endpoint">Endpoint URL</Label>
            <div className="flex gap-2">
              <Input id="ai-endpoint" value={aiEndpointUrl} onChange={(e) => { setAiEndpointUrl(e.target.value); setAiTest(null); }} placeholder="http://192.168.1.x:8080" />
              <Button variant="outline" size="sm" onClick={testAiConnection} disabled={aiTesting || !aiEndpointUrl} className="shrink-0 gap-1.5">
                {aiTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />} Test
              </Button>
            </div>
            <TestBadge result={aiTest} testing={aiTesting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-model">Model Name <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="ai-model" value={aiModelName} onChange={(e) => setAiModelName(e.target.value)} placeholder="e.g., llama-3.2-3b, mistral" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-key">API Key <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="ai-key" type="password" value={aiApiKey} onChange={(e) => setAiApiKey(e.target.value)} placeholder="For OpenAI-compatible providers" />
          </div>
        </CardContent>
      </Card>

      {/* Embeddings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Embeddings</CardTitle>
          <CardDescription>
            Powers semantic search and "similar entries" — uses the AI endpoint if left empty
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="emb-endpoint">Endpoint URL <span className="text-muted-foreground">(optional)</span></Label>
            <div className="flex gap-2">
              <Input id="emb-endpoint" value={embeddingEndpointUrl} onChange={(e) => { setEmbeddingEndpointUrl(e.target.value); setEmbeddingTest(null); }} placeholder="Leave empty to use AI endpoint" />
              <Button variant="outline" size="sm" onClick={testEmbeddingConnection} disabled={embeddingTesting || (!embeddingEndpointUrl && !aiEndpointUrl)} className="shrink-0 gap-1.5">
                {embeddingTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />} Test
              </Button>
            </div>
            <TestBadge result={embeddingTest} testing={embeddingTesting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emb-model">Model Name <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="emb-model" value={embeddingModelName} onChange={(e) => setEmbeddingModelName(e.target.value)} placeholder="e.g., nomic-embed-text" />
          </div>
        </CardContent>
      </Card>

      {/* Whisper */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mic className="h-5 w-5" /> Voice Transcription (Whisper)</CardTitle>
          <CardDescription>
            Powers voice-to-text for hands-free journaling — requires a faster-whisper server
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="whisper-endpoint">Endpoint URL</Label>
            <div className="flex gap-2">
              <Input id="whisper-endpoint" value={whisperEndpointUrl} onChange={(e) => { setWhisperEndpointUrl(e.target.value); setWhisperTest(null); }} placeholder="http://192.168.1.x:5000" />
              <Button variant="outline" size="sm" onClick={testWhisperConnection} disabled={whisperTesting || !whisperEndpointUrl} className="shrink-0 gap-1.5">
                {whisperTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />} Test
              </Button>
            </div>
            <TestBadge result={whisperTest} testing={whisperTesting} />
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      {/* Admin Section */}
      {isAdmin && (
        <>
          <Separator />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Administration</CardTitle>
              <CardDescription>Manage users and registration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Registration Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Registration</p>
                  <p className="text-xs text-muted-foreground">
                    {registrationOpen ? "New users can create accounts" : "Only existing users can sign in"}
                  </p>
                </div>
                <Button
                  variant={registrationOpen ? "destructive" : "default"}
                  size="sm"
                  disabled={adminLoading}
                  onClick={async () => {
                    setAdminLoading(true);
                    try {
                      const res = await fetch("/api/admin/registration", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ open: !registrationOpen }),
                      });
                      if (res.ok) {
                        setRegistrationOpen(!registrationOpen);
                        toast.success(registrationOpen ? "Registration closed" : "Registration opened");
                      }
                    } finally { setAdminLoading(false); }
                  }}
                >
                  {registrationOpen ? "Close Registration" : "Open Registration"}
                </Button>
              </div>

              <Separator />

              {/* Users List */}
              <div>
                <p className="text-sm font-medium flex items-center gap-1 mb-3">
                  <Users className="h-4 w-4" /> Users ({allUsers.length})
                </p>
                <div className="space-y-2">
                  {allUsers.map((user) => (
                    <div key={user.id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="text-sm font-medium">
                          {user.name}
                          {user.isAdmin && <span className="ml-2 text-xs text-muted-foreground">(admin)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      {!user.isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={async () => {
                            if (!confirm(`Delete user ${user.name}?`)) return;
                            const res = await fetch("/api/admin/users", {
                              method: "DELETE",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ userId: user.id }),
                            });
                            if (res.ok) {
                              setAllUsers((prev) => prev.filter((u) => u.id !== user.id));
                              toast.success(`Deleted ${user.name}`);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
