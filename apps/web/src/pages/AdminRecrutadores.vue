<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ago, errorMessage, get, send } from "@/api";

// Mesmo token de admin guardado pela tela do resumo.
const KEY = "iaprohub-vagas:admin-token";
const read = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};

interface Row {
  id: number;
  email: string;
  company: string;
  status: "pendente" | "aprovado" | "recusado";
  createdAt: string;
}

const token = ref(read());
const items = ref<Row[]>([]);
const error = ref("");

async function load() {
  if (!token.value) return;
  error.value = "";
  try {
    items.value = (await get<{ items: Row[] }>("/api/v1/admin/recruiters", { authorization: `Bearer ${token.value}` })).items;
    try {
      localStorage.setItem(KEY, token.value);
    } catch {
      /* sem storage: só não lembra o token */
    }
  } catch (err) {
    error.value = (err as { status?: number }).status === 401 ? "Token de admin inválido." : errorMessage(err);
  }
}

async function decide(r: Row, status: "aprovado" | "recusado") {
  await send("POST", `/api/v1/admin/recruiters/${r.id}`, { status }, { authorization: `Bearer ${token.value}` });
  r.status = status;
}

onMounted(load);
</script>

<template>
  <h1 class="text-2xl font-bold tracking-tight">Recrutadores</h1>
  <p class="mt-1 text-muted-foreground">Confira a empresa e o e-mail antes de liberar o banco de talentos.</p>
  <form class="mt-5 flex gap-2" @submit.prevent="load">
    <Input v-model="token" type="password" class="max-w-sm" placeholder="Token de admin" autocomplete="current-password" />
    <Button type="submit">Carregar</Button>
  </form>
  <p v-if="error" class="mt-3 text-sm text-destructive">{{ error }}</p>
  <ul class="mt-6 divide-y divide-border">
    <li v-for="r in items" :key="r.id" class="flex flex-wrap items-center justify-between gap-3 py-3">
      <div class="min-w-0">
        <p class="font-medium">{{ r.company }}</p>
        <p class="text-sm text-muted-foreground">{{ r.email }} · {{ ago(r.createdAt) }}</p>
      </div>
      <div v-if="r.status === 'pendente'" class="flex gap-2">
        <Button size="sm" @click="decide(r, 'aprovado')">Aprovar</Button>
        <Button size="sm" variant="outline" @click="decide(r, 'recusado')">Recusar</Button>
      </div>
      <span v-else class="text-sm" :class="r.status === 'aprovado' ? 'text-primary' : 'text-muted-foreground'">{{ r.status }}</span>
    </li>
  </ul>
  <p v-if="token && !items.length && !error" class="mt-6 text-muted-foreground">Nenhum pedido ainda.</p>
</template>
