<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { toast } from "vue-sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
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
    error.value = (err as { status?: number }).status === 401 ? "Token de admin inválido. Confira e gere de novo." : "Não foi possível gerar o resumo. Tente de novo.";
  } finally {
    loading.value = false;
  }
}

// ---- Resumo automático no grupo do WhatsApp ----
interface WaInfo {
  enabled: boolean;
  state?: string;
  error?: string;
  times?: string[];
  groupJid: string | null;
  groups: { id: string; subject: string; size: number | null }[];
  sends: { slot: string; count: number; sentAt: string | null; error: string | null }[];
}
const wa = ref<WaInfo | null>(null);
const waGroup = ref("nenhum");
const waBusy = ref(false);
const waSaving = ref(false);
const groupName = computed(() => wa.value?.groups.find((g) => g.id === wa.value?.groupJid)?.subject ?? "grupo escolhido");
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
  waSaving.value = true;
  try {
    await send("PUT", "/api/v1/admin/whatsapp", { groupJid: waGroup.value === "nenhum" ? null : waGroup.value }, auth());
    toast.success(waGroup.value === "nenhum" ? "Resumo automático desligado" : "Grupo salvo");
    await loadWa();
  } catch (err) {
    toast.error(`Não foi possível salvar o grupo. ${errorMessage(err)}`);
  } finally {
    waSaving.value = false;
  }
}

async function sendNow() {
  waBusy.value = true;
  try {
    const r = await send<{ sent: number }>("POST", "/api/v1/admin/whatsapp/send", { hours: Number(hours.value) }, auth());
    toast.success(`Resumo enviado no grupo (${r.sent} vagas)`);
  } catch (err) {
    toast.error(`Não foi possível enviar. ${errorMessage(err)}`);
  } finally {
    waBusy.value = false;
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(text.value);
    toast.success("Texto copiado");
  } catch {
    toast.error("Não foi possível copiar. Selecione o texto e copie à mão.");
  }
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Resumo para o WhatsApp</h1>
      <p class="mt-1 text-sm text-muted-foreground">Vagas que entraram no período, prontas para copiar e colar nos grupos.</p>
    </div>

    <form class="flex flex-col gap-2" @submit.prevent="load">
      <div class="flex flex-wrap items-end gap-2">
        <div class="flex min-w-[200px] flex-1 flex-col gap-2">
          <Label for="admin-token">Token de admin</Label>
          <Input id="admin-token" v-model="token" type="password" autocomplete="current-password" :aria-invalid="!!error || undefined" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="hours">Período</Label>
          <Select v-model="hours">
            <SelectTrigger id="hours" class="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24">Últimas 24h</SelectItem>
              <SelectItem value="48">Últimas 48h</SelectItem>
              <SelectItem value="72">Últimos 3 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" :disabled="loading"><Spinner v-if="loading" />Gerar resumo</Button>
      </div>
      <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
    </form>

    <div v-if="text" class="flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <span class="text-sm text-muted-foreground tabular-nums">{{ count }} {{ count === 1 ? "vaga" : "vagas" }}</span>
        <Button type="button" @click="copy">Copiar texto</Button>
      </div>
      <Textarea v-model="text" rows="22" spellcheck="false" aria-label="Texto do resumo" class="field-sizing-fixed resize-y bg-card font-mono" />
    </div>

    <section v-if="wa" class="flex flex-col gap-3 border-t border-border pt-6">
      <h2 class="text-lg font-semibold">Resumo automático no WhatsApp</h2>
      <p v-if="!wa.enabled" class="text-sm text-muted-foreground">WhatsApp não configurado no servidor.</p>
      <template v-else>
        <p class="text-sm text-muted-foreground">
          Conexão: <Badge :variant="wa.state === 'open' ? 'default' : 'destructive'" :title="wa.state">{{ wa.state === "open" ? "Conectado" : "Desconectado" }}</Badge>.
          O resumo sai às {{ (wa.times ?? []).map((t) => t.replace(":", "h")).join(", ") }} no grupo escolhido, com as vagas que chegaram desde o envio anterior. Horário sem vaga nova não manda nada.
        </p>
        <p v-if="wa.error" class="text-sm text-destructive">{{ wa.error }}</p>
        <div class="flex flex-col gap-2">
          <Label for="wa-group">Grupo</Label>
          <div class="flex flex-wrap items-center gap-2">
            <Select v-model="waGroup">
              <SelectTrigger id="wa-group" class="w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Nenhum (desligado)</SelectItem>
                <SelectItem v-for="g in wa.groups" :key="g.id" :value="g.id">{{ g.subject }}{{ g.size ? ` (${g.size})` : "" }}</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" :disabled="waSaving" @click="saveGroup"><Spinner v-if="waSaving" />Salvar grupo</Button>
            <AlertDialog>
              <AlertDialogTrigger as-child>
                <Button type="button" :disabled="waBusy || !wa.groupJid"><Spinner v-if="waBusy" />Enviar agora</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Enviar o resumo agora?</AlertDialogTitle>
                  <AlertDialogDescription>As vagas das {{ hours }} últimas horas vão para o grupo {{ groupName }}. A mensagem não pode ser apagada daqui depois.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction @click="sendNow">Enviar resumo</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        <p v-if="!wa.groups.length && !wa.error" class="text-sm text-muted-foreground">O número ainda não está em nenhum grupo. Adicione ele no grupo da comunidade e recarregue.</p>
        <ul v-if="wa.sends.length" class="text-sm text-muted-foreground">
          <li v-for="s in wa.sends" :key="s.slot">
            {{ s.slot }}: {{ s.error ? `falhou (${s.error})` : s.sentAt ? `${s.count} vagas enviadas` : "sem vagas novas" }}
          </li>
        </ul>
      </template>
    </section>
  </div>
</template>
