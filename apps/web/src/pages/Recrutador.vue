<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Search } from "@lucide/vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorMessage, get, label, send, type Talent } from "@/api";
import { me } from "@/lib/session";

document.title = "Banco de talentos | IAPro Vagas";

const router = useRouter();
const filters = reactive({ q: "", seniority: "todas", workplace: "todos" });
const items = ref<Talent[]>([]);
const total = ref(0);
const loading = ref(false);
const contacting = ref<string | null>(null);
const message = ref("");
const sent = ref<Set<string>>(new Set());
const error = ref("");

watch(
  me,
  (m) => {
    if (m === null) router.replace("/entrar?next=/recrutador");
    else if (m && m.recruiterStatus !== "aprovado") router.replace("/conta");
    else if (m) search();
  },
  { immediate: true },
);

async function search() {
  loading.value = true;
  const p = new URLSearchParams();
  if (filters.q.trim()) p.set("q", filters.q.trim());
  if (filters.seniority !== "todas") p.set("seniority", filters.seniority);
  if (filters.workplace !== "todos") p.set("workplace", filters.workplace);
  try {
    const r = await get<{ total: number; items: Talent[] }>(`/api/v1/talents?${p}`);
    items.value = r.items;
    total.value = r.total;
  } finally {
    loading.value = false;
  }
}

async function contact(id: string) {
  error.value = "";
  try {
    await send("POST", `/api/v1/talents/${id}/contact`, { message: message.value });
    sent.value.add(id);
    contacting.value = null;
    message.value = "";
  } catch (err) {
    error.value = errorMessage(err);
  }
}

const money = (n: number) => `R$ ${n.toLocaleString("pt-BR")}`;
</script>

<template>
  <div v-if="me?.recruiterStatus === 'aprovado'">
    <h1 class="text-2xl font-bold tracking-tight">Banco de talentos</h1>
    <p class="mt-1 text-muted-foreground">Perfis de quem aceitou aparecer para recrutadores. Nome e contato chegam por e-mail quando a pessoa aceita o seu pedido.</p>

    <form class="mt-5 flex flex-wrap gap-2" @submit.prevent="search">
      <div class="relative min-w-[220px] flex-1">
        <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="filters.q" class="pl-9" placeholder="Tecnologia ou cargo: react, dados, devops..." />
      </div>
      <Select v-model="filters.seniority">
        <SelectTrigger class="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Toda senioridade</SelectItem>
          <SelectItem v-for="s in ['estagio', 'junior', 'pleno', 'senior', 'especialista', 'lideranca']" :key="s" :value="s">{{ label(s) }}</SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="filters.workplace">
        <SelectTrigger class="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todo modelo</SelectItem>
          <SelectItem v-for="w in ['remoto', 'hibrido', 'presencial']" :key="w" :value="w">{{ label(w) }}</SelectItem>
        </SelectContent>
      </Select>
      <Button type="submit" :disabled="loading">Buscar</Button>
    </form>

    <p class="mt-4 text-sm text-muted-foreground">{{ total }} {{ total === 1 ? "perfil" : "perfis" }}</p>
    <div class="mt-3 grid gap-4 md:grid-cols-2">
      <Card v-for="t in items" :key="t.id" class="flex flex-col gap-2 p-5 shadow-none">
        <div class="flex items-start justify-between gap-2">
          <h2 class="font-semibold leading-snug">{{ t.headline || "Profissional de tecnologia" }}</h2>
          <Badge v-if="t.pro" class="shrink-0">Pro</Badge>
        </div>
        <p class="text-sm text-muted-foreground">
          {{ [t.seniority.map(label).join("/"), t.workplace.map(label).join("/"), t.region, t.salaryMin ? `a partir de ${money(t.salaryMin)}` : null].filter(Boolean).join(" · ") }}
        </p>
        <p v-if="t.currentCompany || t.linkedin" class="text-sm">
          {{ t.currentCompany }}<a v-if="t.linkedin" :href="t.linkedin" target="_blank" rel="noopener nofollow" class="ml-2 text-primary">LinkedIn</a>
        </p>
        <div v-if="t.stack.length" class="flex flex-wrap gap-1.5">
          <span v-for="s in t.stack" :key="s" class="rounded-sm border border-border px-2 py-0.5 text-xs text-muted-foreground">{{ s }}</span>
        </div>
        <p v-if="t.summary" class="line-clamp-4 whitespace-pre-line text-sm text-foreground/85">{{ t.summary }}</p>
        <div class="mt-auto pt-2">
          <p v-if="sent.has(t.id)" class="text-sm text-primary">Pedido enviado ✓</p>
          <form v-else-if="contacting === t.id" class="space-y-2" @submit.prevent="contact(t.id)">
            <textarea
              v-model="message"
              rows="4"
              minlength="20"
              maxlength="1500"
              required
              class="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Conte a vaga, a empresa e por que o perfil chamou atenção."
            />
            <div class="flex gap-2">
              <Button type="submit" size="sm">Enviar pedido</Button>
              <Button type="button" size="sm" variant="ghost" @click="contacting = null">Cancelar</Button>
            </div>
            <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
          </form>
          <Button v-else size="sm" variant="outline" @click="contacting = t.id; error = ''">Pedir contato</Button>
        </div>
      </Card>
    </div>
    <p v-if="!loading && !items.length" class="py-10 text-center text-muted-foreground">Nenhum perfil com esses filtros.</p>
  </div>
  <p v-else class="text-muted-foreground">Carregando...</p>
</template>
