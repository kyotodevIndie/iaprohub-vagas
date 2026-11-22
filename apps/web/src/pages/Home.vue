<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { SearchX, Search, TriangleAlert } from "@lucide/vue";
import AdCard from "@/components/AdCard.vue";
import AdSenseCard from "@/components/AdSenseCard.vue";
import JobCard from "@/components/JobCard.vue";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { adsense } from "@/lib/adsense";
import { me } from "@/lib/session";
import { fetchAds, fetchJobs, type Ad, type Job } from "@/api";

const route = useRoute();
const router = useRouter();
const one = (v: unknown) => (typeof v === "string" ? v : "");

const filters = reactive({
  q: one(route.query.q),
  workplace: one(route.query.workplace) || "todos",
  seniority: one(route.query.seniority),
  salary: route.query.salary === "1",
});

const jobs = ref<Job[]>([]);
const ads = ref<Ad[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const failed = ref(false);

const WORKPLACES: [string, string][] = [["todos", "Todos os modelos"], ["remoto", "Remoto"], ["hibrido", "Híbrido"], ["presencial", "Presencial"]];
const SENIORITIES: [string, string][] = [["estagio", "Estágio"], ["junior", "Júnior"], ["pleno", "Pleno"], ["senior", "Sênior"], ["especialista", "Especialista"], ["lideranca", "Liderança"]];
const AD_EVERY = 12;

/** Vagas com um anúncio a cada 12 cards: o direto quando houver, senão o AdSense, senão nenhum. */
const feed = computed(() => {
  const out: ({ kind: "job"; job: Job } | { kind: "ad"; ad: Ad; key: string } | { kind: "adsense"; key: string })[] = [];
  jobs.value.forEach((job, i) => {
    out.push({ kind: "job", job });
    const n = (i + 1) / AD_EVERY;
    if (!Number.isInteger(n) || me.value === undefined || me.value?.pro) return; // Pro não vê anúncio; espera a conta carregar
    if (ads.value.length) out.push({ kind: "ad", ad: ads.value[(n - 1) % ads.value.length]!, key: `ad-${n}` });
    else if (adsense) out.push({ kind: "adsense", key: `adsense-${n}` });
  });
  return out;
});

function params(p: number) {
  const s = new URLSearchParams();
  if (filters.q.trim()) s.set("q", filters.q.trim());
  if (filters.workplace !== "todos") s.set("workplace", filters.workplace);
  if (filters.seniority) s.set("seniority", filters.seniority);
  if (filters.salary) s.set("salary", "1");
  if (p > 1) s.set("page", String(p));
  return s;
}

let seq = 0;
async function load(reset: boolean) {
  const mine = ++seq;
  const p = reset ? 1 : page.value + 1;
  loading.value = true;
  failed.value = false;
  try {
    const data = await fetchJobs(params(p));
    if (mine !== seq) return;
    jobs.value = reset ? data.items : [...jobs.value, ...data.items];
    total.value = data.total;
    page.value = p;
  } catch {
    if (mine === seq) failed.value = true;
  } finally {
    if (mine === seq) loading.value = false;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch(filters, () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    router.replace({ query: Object.fromEntries(params(1)) });
    load(true);
  }, 250);
});

const filtered = computed(() => !!(filters.q.trim() || filters.workplace !== "todos" || filters.seniority || filters.salary));
const clearFilters = () => Object.assign(filters, { q: "", workplace: "todos", seniority: "", salary: false });
const pill =
  "h-8 rounded-full border-border px-3.5 font-normal text-muted-foreground shadow-none data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90";

onMounted(() => {
  load(true);
  fetchAds().then((a) => (ads.value = a), () => {});
});
</script>

<template>
  <section class="flex flex-col gap-6">
    <div class="flex items-baseline gap-3">
      <h1 class="text-2xl font-semibold tracking-tight">Vagas abertas</h1>
      <span v-if="total" class="text-sm text-muted-foreground tabular-nums">{{ total }} {{ total === 1 ? "vaga" : "vagas" }}</span>
    </div>

    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-3 sm:flex-row">
        <div class="relative flex-1">
          <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input v-model="filters.q" type="search" class="h-10 pl-9" placeholder="Buscar por cargo, empresa ou stack..." aria-label="Buscar vagas" />
        </div>
        <Select v-model="filters.workplace">
          <SelectTrigger class="w-full data-[size=default]:h-10 sm:w-52" aria-label="Modelo de trabalho">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="[v, l] in WORKPLACES" :key="v" :value="v">{{ l }}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex flex-wrap gap-2">
        <Toggle
          v-for="[v, l] in SENIORITIES"
          :key="v"
          variant="outline"
          :class="pill"
          :model-value="filters.seniority === v"
          @update:model-value="(on) => (filters.seniority = on ? v : '')"
        >{{ l }}</Toggle>
        <Toggle v-model="filters.salary" variant="outline" :class="pill">Com salário</Toggle>
      </div>
    </div>

    <div v-if="jobs.length" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <template v-for="item in feed" :key="item.kind === 'job' ? item.job.code : item.key">
        <JobCard v-if="item.kind === 'job'" :job="item.job" />
        <AdCard v-else-if="item.kind === 'ad'" :ad="item.ad" />
        <AdSenseCard v-else />
      </template>
    </div>
    <div v-else-if="loading" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
      <Skeleton v-for="n in 6" :key="n" class="h-52 rounded-xl" />
    </div>
    <Empty v-else-if="failed">
      <EmptyHeader>
        <EmptyMedia variant="icon"><TriangleAlert /></EmptyMedia>
        <EmptyTitle>Não foi possível carregar as vagas</EmptyTitle>
        <EmptyDescription>Confira a sua conexão e tente de novo.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent><Button variant="outline" @click="load(true)">Tentar de novo</Button></EmptyContent>
    </Empty>
    <Empty v-else-if="filtered">
      <EmptyHeader>
        <EmptyMedia variant="icon"><SearchX /></EmptyMedia>
        <EmptyTitle>Nenhuma vaga com esses filtros</EmptyTitle>
        <EmptyDescription>Tente outra busca ou tire alguns filtros.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent><Button variant="outline" @click="clearFilters">Limpar filtros</Button></EmptyContent>
    </Empty>
    <Empty v-else>
      <EmptyHeader>
        <EmptyMedia variant="icon"><Search /></EmptyMedia>
        <EmptyTitle>Nenhuma vaga no ar agora</EmptyTitle>
        <EmptyDescription>Vagas novas chegam todo dia. Volte mais tarde.</EmptyDescription>
      </EmptyHeader>
    </Empty>

    <div v-if="jobs.length < total" class="flex justify-center">
      <Button variant="outline" size="lg" :disabled="loading" @click="load(false)">
        <Spinner v-if="loading" />
        Carregar mais vagas
      </Button>
    </div>
  </section>
</template>
