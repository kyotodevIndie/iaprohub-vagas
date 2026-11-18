<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchDigest } from "../api";

const KEY = "iaprohub-vagas:admin-token";
const read = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};

const token = ref(read());
const hours = ref(24);
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
    const d = await fetchDigest(token.value, hours.value);
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
  <h1>Resumo para o WhatsApp</h1>
  <p class="muted">Vagas que entraram no período, prontas para copiar e colar nos grupos.</p>

  <form class="row" @submit.prevent="load">
    <input v-model="token" type="password" class="field grow" placeholder="Token de admin" autocomplete="current-password" />
    <select v-model.number="hours" class="field">
      <option :value="24">Últimas 24h</option>
      <option :value="48">Últimas 48h</option>
      <option :value="72">Últimos 3 dias</option>
    </select>
    <button class="btn" type="submit" :disabled="loading">{{ loading ? "Gerando..." : "Gerar" }}</button>
  </form>

  <p v-if="error" class="err">{{ error }}</p>

  <template v-if="text">
    <div class="row between">
      <span class="muted">{{ count }} {{ count === 1 ? "vaga" : "vagas" }}</span>
      <button class="btn" type="button" @click="copy">{{ copied ? "Copiado ✓" : "Copiar texto" }}</button>
    </div>
    <textarea v-model="text" class="field out" rows="22" spellcheck="false" />
  </template>
</template>

<style scoped>
h1 { font-size: 24px; margin: 0 0 6px; }
.row { display: flex; gap: 10px; margin-top: 18px; align-items: center; flex-wrap: wrap; }
.between { justify-content: space-between; }
.grow { flex: 1; min-width: 200px; }
.out { width: 100%; margin-top: 12px; font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: 13.5px; resize: vertical; }
.err { color: #ff8a8a; }
</style>
