<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Search, SearchX, TriangleAlert, Users } from "@lucide/vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, get, label, send, type Talent } from "@/api";
import { me } from "@/lib/session";

document.title = "Banco de talentos | IAPro Vagas";

const router = useRouter();
const filters = reactive({ q: "", seniority: "todas", workplace: "todos" });
const items = ref<Talent[]>([]);
const total = ref(0);
const page = ref(1);
const PAGE_SIZE = 20;
const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));
const loading = ref(false);
const failed = ref(false);
const searched = ref({ ...filters });
const sending = ref(false);
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

async function search(p = 1) {
  loading.value = true;
  failed.value = false;
  const qs = new URLSearchParams();
  if (filters.q.trim()) qs.set("q", filters.q.trim());
  if (filters.seniority !== "todas") qs.set("seniority", filters.seniority);
  if (filters.workplace !== "todos") qs.set("workplace", filters.workplace);
  if (p > 1) qs.set("page", String(p));
  try {
    const r = await get<{ total: number; items: Talent[] }>(`/api/v1/talents?${qs}`);
    items.value = r.items;
    total.value = r.total;
    page.value = p;
    searched.value = { ...filters };
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

async function contact(id: string) {
  error.value = message.value.trim().length < 20 ? "Escreva pelo menos 20 caracteres: a vaga, a empresa e o motivo do contato." : "";
  if (error.value) return;
  sending.value = true;
  try {
    await send("POST", `/api/v1/talents/${id}/contact`, { message: message.value });
    sent.value.add(id);
    contacting.value = null;
    message.value = "";
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    sending.value = false;
  }
}

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const filtered = () => !!(searched.value.q.trim() || searched.value.seniority !== "todas" || searched.value.workplace !== "todos");
const clearFilters = () => {
  Object.assign(filters, { q: "", seniority: "todas", workplace: "todos" });
  search();
};
</script>

<template>
  <div v-if="me?.recruiterStatus === 'aprovado'" class="flex flex-col gap-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Banco de talentos</h1>
      <p class="mt-1 text-sm text-muted-foreground">Perfis de quem aceitou aparecer para recrutadores. Nome e contato chegam por e-mail quando a pessoa aceita o seu pedido.</p>
    </div>

    <form class="flex flex-wrap gap-2" @submit.prevent="search()">
      <div class="relative min-w-[220px] flex-1">
        <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input v-model="filters.q" type="search" class="pl-9" placeholder="Buscar por tecnologia ou cargo: react, dados..." aria-label="Buscar talentos" />
      </div>
      <Select v-model="filters.seniority">
        <SelectTrigger class="w-44" aria-label="Senioridade"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Toda senioridade</SelectItem>
          <SelectItem v-for="s in ['estagio', 'junior', 'pleno', 'senior', 'especialista', 'lideranca']" :key="s" :value="s">{{ label(s) }}</SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="filters.workplace">
        <SelectTrigger class="w-40" aria-label="Modelo de trabalho"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todo modelo</SelectItem>
          <SelectItem v-for="w in ['remoto', 'hibrido', 'presencial']" :key="w" :value="w">{{ label(w) }}</SelectItem>
        </SelectContent>
      </Select>
      <Button type="submit" :disabled="loading"><Spinner v-if="loading" />Buscar</Button>
    </form>

    <div v-if="loading && !items.length" class="grid gap-4 md:grid-cols-2" aria-busy="true">
      <Skeleton v-for="n in 4" :key="n" class="h-44 rounded-xl" />
    </div>
    <Empty v-else-if="failed">
      <EmptyHeader>
        <EmptyMedia variant="icon"><TriangleAlert /></EmptyMedia>
        <EmptyTitle>Não foi possível carregar os perfis</EmptyTitle>
        <EmptyDescription>Confira a sua conexão e tente de novo.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent><Button variant="outline" @click="search(page)">Tentar de novo</Button></EmptyContent>
    </Empty>
    <Empty v-else-if="!items.length && filtered()">
      <EmptyHeader>
        <EmptyMedia variant="icon"><SearchX /></EmptyMedia>
        <EmptyTitle>Nenhum perfil com esses filtros</EmptyTitle>
        <EmptyDescription>Tente outra tecnologia ou tire alguns filtros.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent><Button variant="outline" @click="clearFilters">Limpar filtros</Button></EmptyContent>
    </Empty>
    <Empty v-else-if="!items.length">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Users /></EmptyMedia>
        <EmptyTitle>Nenhum perfil ainda</EmptyTitle>
        <EmptyDescription>Os perfis aparecem aqui quando alguém aceita entrar no banco de talentos.</EmptyDescription>
      </EmptyHeader>
    </Empty>
    <template v-else>
      <div class="grid gap-4 md:grid-cols-2">
        <Card v-for="t in items" :key="t.id" class="gap-2 p-6 shadow-none">
          <div class="flex items-start justify-between gap-2">
            <h2 class="text-base font-semibold leading-snug">{{ t.headline || "Profissional de tecnologia" }}</h2>
            <Badge v-if="t.pro" class="shrink-0">Pro</Badge>
          </div>
          <p class="text-sm text-muted-foreground">
            {{ [t.seniority.map(label).join("/"), t.workplace.map(label).join("/"), t.region, t.salaryMin ? `a partir de ${money(t.salaryMin)}` : null].filter(Boolean).join(" · ") }}
          </p>
          <p v-if="t.currentCompany || t.linkedin" class="text-sm">
            {{ t.currentCompany }}<a v-if="t.linkedin" :href="t.linkedin" target="_blank" rel="noopener nofollow" class="ml-2 text-primary">LinkedIn</a>
          </p>
          <div v-if="t.stack.length" class="flex flex-wrap gap-1.5">
            <Badge v-for="s in t.stack" :key="s" variant="outline" class="rounded-sm font-normal text-muted-foreground">{{ s }}</Badge>
          </div>
          <p v-if="t.summary" class="line-clamp-4 whitespace-pre-line text-sm text-foreground/85">{{ t.summary }}</p>
          <div class="mt-auto pt-2">
            <p v-if="sent.has(t.id)" class="text-sm text-primary">Pedido enviado. Avisamos por e-mail quando a pessoa responder.</p>
            <form v-else-if="contacting === t.id" class="flex flex-col gap-2" novalidate @submit.prevent="contact(t.id)">
              <Label :for="`msg-${t.id}`">Mensagem para a pessoa</Label>
              <Textarea
                :id="`msg-${t.id}`"
                v-model="message"
                rows="4"
                maxlength="1500"
                class="field-sizing-fixed resize-y"
                placeholder="Conte a vaga, a empresa e por que o perfil chamou atenção."
                :aria-invalid="!!error || undefined"
              />
              <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
              <div class="flex justify-end gap-2">
                <Button type="button" size="sm" variant="outline" @click="contacting = null">Cancelar</Button>
                <Button type="submit" size="sm" :disabled="sending"><Spinner v-if="sending" />Enviar pedido</Button>
              </div>
            </form>
            <Button v-else size="sm" variant="outline" @click="contacting = t.id; error = ''">Pedir contato</Button>
          </div>
        </Card>
      </div>
      <div class="flex items-center justify-end gap-2">
        <span class="mr-2 text-sm text-muted-foreground tabular-nums">{{ total.toLocaleString("pt-BR") }} {{ total === 1 ? "perfil" : "perfis" }}</span>
        <Button variant="outline" size="sm" :disabled="loading || page <= 1" @click="search(page - 1)">Anterior</Button>
        <span class="text-sm text-muted-foreground tabular-nums">{{ page }} de {{ pages }}</span>
        <Button variant="outline" size="sm" :disabled="loading || page >= pages" @click="search(page + 1)">Próxima</Button>
      </div>
    </template>
  </div>
  <div v-else class="flex flex-col gap-4" aria-busy="true">
    <Skeleton class="h-8 w-1/3" />
    <Skeleton class="h-9 w-full" />
  </div>
</template>
