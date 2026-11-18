<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchDigest } from "@/api";

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
</template>
