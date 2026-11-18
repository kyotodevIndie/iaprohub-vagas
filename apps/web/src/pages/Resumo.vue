<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorMessage, fetchDigest, get, send } from "@/api";

const KEY = "iaprohub-vagas:admin-token";
const read = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};

const token = ref(read());
const hours = ref("24");
const text = ref("");
const count = ref(0);
const error = ref("");
const copied = ref(false);
const loading = ref(false);

async function load() {
  if (!token.value) return;
  loading.value = true;
  error.value = "";
  try {
    const d = await fetchDigest(token.value, Number(hours.value));
    text.value = d.text;
    count.value = d.count;
    loadWa();
    try {
      localStorage.setItem(KEY, token.value);
    } catch {
      /* navegador sem storage: só não lembra o token */
    }
  } catch (err) {
    error.value = (err as { status?: number }).status === 401 ? "Token de admin inválido." : "Não deu para gerar o resumo.";
  } finally {
    loading.value = false;
  }
}

// ---- Resumo automático no grupo do WhatsApp ----
interface WaInfo {
  enabled: boolean;
  state?: string;
  error?: string;
  hour?: number;
  groupJid: string | null;
  groups: { id: string; subject: string; size: number | null }[];
  sends: { day: string; count: number; sentAt: string | null; error: string | null }[];
}
const wa = ref<WaInfo | null>(null);
const waGroup = ref("nenhum");
const waMsg = ref("");
const waBusy = ref(false);
const auth = () => ({ authorization: `Bearer ${token.value}` });

async function loadWa() {
  try {
    wa.value = await get<WaInfo>("/api/v1/admin/whatsapp", auth());
    waGroup.value = wa.value.groupJid ?? "nenhum";
  } catch {
    wa.value = null;
  }
}

async function saveGroup() {
  waMsg.value = "";
  try {
    await send("PUT", "/api/v1/admin/whatsapp", { groupJid: waGroup.value === "nenhum" ? null : waGroup.value }, auth());
    waMsg.value = waGroup.value === "nenhum" ? "Resumo automático desligado." : "Grupo salvo. O resumo sai sozinho todo dia.";
    await loadWa();
  } catch (err) {
    waMsg.value = errorMessage(err);
  }
}

async function sendNow() {
  if (!window.confirm("Mandar o resumo agora no grupo escolhido?")) return;
  waBusy.value = true;
  waMsg.value = "";
  try {
    const r = await send<{ sent: number }>("POST", "/api/v1/admin/whatsapp/send", { hours: Number(hours.value) }, auth());
    waMsg.value = `Enviado no grupo (${r.sent} vagas).`;
  } catch (err) {
    waMsg.value = errorMessage(err);
  } finally {
    waBusy.value = false;
  }
}

async function copy() {
  await navigator.clipboard.writeText(text.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

onMounted(load);
</script>

<template>
  <h1 class="text-2xl font-bold tracking-tight">Resumo para o WhatsApp</h1>
  <p class="mt-1 text-muted-foreground">Vagas que entraram no período, prontas para copiar e colar nos grupos.</p>

  <form class="mt-5 flex flex-wrap items-center gap-2" @submit.prevent="load">
    <Input v-model="token" type="password" class="min-w-[200px] flex-1" placeholder="Token de admin" autocomplete="current-password" />
    <Select v-model="hours">
      <SelectTrigger class="w-44"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="24">Últimas 24h</SelectItem>
        <SelectItem value="48">Últimas 48h</SelectItem>
        <SelectItem value="72">Últimos 3 dias</SelectItem>
      </SelectContent>
    </Select>
    <Button type="submit" :disabled="loading">{{ loading ? "Gerando..." : "Gerar" }}</Button>
  </form>

  <p v-if="error" class="mt-3 text-sm text-destructive">{{ error }}</p>

  <template v-if="text">
    <div class="mt-6 flex items-center justify-between">
      <span class="text-sm text-muted-foreground">{{ count }} {{ count === 1 ? "vaga" : "vagas" }}</span>
      <Button type="button" @click="copy">{{ copied ? "Copiado ✓" : "Copiar texto" }}</Button>
    </div>
    <textarea
      v-model="text"
      rows="22"
      spellcheck="false"
      class="mt-3 w-full resize-y rounded-md border border-input bg-card p-3 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    />
  </template>

  <section v-if="wa" class="mt-10 space-y-3 border-t border-border pt-6">
    <h2 class="text-lg font-semibold">Resumo automático no WhatsApp</h2>
    <p v-if="!wa.enabled" class="text-sm text-muted-foreground">WhatsApp não configurado no servidor.</p>
    <template v-else>
      <p class="text-sm text-muted-foreground">
        Conexão: <b :class="wa.state === 'open' ? 'text-primary' : 'text-destructive'">{{ wa.state === "open" ? "conectado" : wa.state }}</b>.
        O resumo das últimas 24h sai uma vez por dia, a partir das {{ wa.hour ?? 9 }}h, no grupo escolhido. Dia sem vaga nova não manda nada.
      </p>
      <p v-if="wa.error" class="text-sm text-destructive">{{ wa.error }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <Select v-model="waGroup">
          <SelectTrigger class="w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="nenhum">Nenhum (desligado)</SelectItem>
            <SelectItem v-for="g in wa.groups" :key="g.id" :value="g.id">{{ g.subject }}{{ g.size ? ` (${g.size})` : "" }}</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" @click="saveGroup">Salvar grupo</Button>
        <Button type="button" :disabled="waBusy || !wa.groupJid" @click="sendNow">{{ waBusy ? "Enviando..." : "Enviar agora" }}</Button>
      </div>
      <p v-if="!wa.groups.length && !wa.error" class="text-sm text-muted-foreground">O número ainda não está em nenhum grupo. Adicione ele no grupo da comunidade e recarregue.</p>
      <p v-if="waMsg" class="text-sm">{{ waMsg }}</p>
      <ul v-if="wa.sends.length" class="text-sm text-muted-foreground">
        <li v-for="s in wa.sends" :key="s.day">
          {{ s.day }}: {{ s.error ? `falhou (${s.error})` : s.sentAt ? `${s.count} vagas enviadas` : "sem vagas novas" }}
        </li>
      </ul>
    </template>
  </section>
</template>
