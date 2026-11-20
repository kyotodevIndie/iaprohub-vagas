<script setup lang="ts">
import { onMounted, ref } from "vue";
import { toast } from "vue-sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ago, date, errorMessage, get, send } from "@/api";

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
const loading = ref(false);
const loaded = ref(false);

async function load() {
  if (!token.value) return;
  error.value = "";
  loading.value = true;
  try {
    items.value = (await get<{ items: Row[] }>("/api/v1/admin/recruiters", { authorization: `Bearer ${token.value}` })).items;
    try {
      localStorage.setItem(KEY, token.value);
    } catch {
      /* sem storage: só não lembra o token */
    }
  } catch (err) {
    error.value = (err as { status?: number }).status === 401 ? "Token de admin inválido. Confira e carregue de novo." : errorMessage(err);
  } finally {
    loading.value = false;
    loaded.value = true;
  }
}

async function decide(r: Row, status: "aprovado" | "recusado") {
  try {
    await send("POST", `/api/v1/admin/recruiters/${r.id}`, { status }, { authorization: `Bearer ${token.value}` });
    r.status = status;
    toast.success(status === "aprovado" ? `${r.company} aprovada` : `${r.company} recusada`);
  } catch (err) {
    toast.error(`Não foi possível salvar. ${errorMessage(err)}`);
  }
}

const statusVariant = { pendente: "secondary", aprovado: "default", recusado: "outline" } as const;

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Recrutadores</h1>
      <p class="mt-1 text-sm text-muted-foreground">Confira a empresa e o e-mail antes de liberar o banco de talentos.</p>
    </div>
    <form class="flex flex-col gap-2" @submit.prevent="load">
      <Label for="admin-token">Token de admin</Label>
      <div class="flex gap-2">
        <Input id="admin-token" v-model="token" type="password" class="max-w-sm" autocomplete="current-password" :aria-invalid="!!error || undefined" />
        <Button type="submit" :disabled="loading"><Spinner v-if="loading" />Carregar pedidos</Button>
      </div>
      <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
    </form>
    <ul v-if="items.length" class="divide-y divide-border">
      <li v-for="r in items" :key="r.id" class="flex flex-wrap items-center justify-between gap-3 py-3">
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ r.company }}</p>
          <p class="text-sm text-muted-foreground">{{ r.email }} · <span :title="date(r.createdAt)">{{ ago(r.createdAt) }}</span></p>
        </div>
        <div v-if="r.status === 'pendente'" class="flex gap-2">
          <Button size="sm" variant="outline" @click="decide(r, 'recusado')">Recusar</Button>
          <Button size="sm" @click="decide(r, 'aprovado')">Aprovar</Button>
        </div>
        <Badge v-else :variant="statusVariant[r.status]" class="capitalize">{{ r.status }}</Badge>
      </li>
    </ul>
    <p v-else-if="loaded && !error" class="text-sm text-muted-foreground">Nenhum pedido ainda.</p>
  </div>
</template>
