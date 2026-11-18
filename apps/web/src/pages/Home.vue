<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Search } from "@lucide/vue";
import AdCard from "@/components/AdCard.vue";
import AdSenseCard from "@/components/AdSenseCard.vue";
import JobCard from "@/components/JobCard.vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adsense } from "@/lib/adsense";
import { me } from "@/lib/session";
import { cn } from "@/lib/utils";
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

const toggleSeniority = (s: string) => (filters.seniority = filters.seniority === s ? "" : s);
const pill = (on: boolean) =>
  cn("rounded-full border-border px-3.5 font-normal text-muted-foreground shadow-none", on && "border-primary bg-primary font-semibold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground");

onMounted(() => {
  load(true);
  fetchAds().then((a) => (ads.value = a), () => {});
});
</script>

<template>
  <section>
    <div class="mb-5 flex items-baseline gap-3">
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Vagas abertas</h1>
      <span v-if="total" class="text-sm text-muted-foreground">{{ total }} {{ total === 1 ? "vaga" : "vagas" }}</span>
    </div>

    <div class="flex flex-col gap-3 sm:flex-row">
      <div class="relative flex-1">
        <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input v-model="filters.q" type="search" class="h-control-lg bg-card pl-9" placeholder="Buscar por cargo, empresa ou stack..." aria-label="Buscar vagas" />
      </div>
      <Select v-model="filters.workplace">
        <SelectTrigger class="h-control-lg bg-card sm:w-52" aria-label="Modelo de trabalho">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="[v, l] in WORKPLACES" :key="v" :value="v">{{ l }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="mb-6 mt-4 flex flex-wrap gap-2">
      <Button
        v-for="[v, l] in SENIORITIES"
        :key="v"
        variant="outline"
        size="sm"
        :class="pill(filters.seniority === v)"
        :aria-pressed="filters.seniority === v"
        @click="toggleSeniority(v)"
      >{{ l }}</Button>
      <Button variant="outline" size="sm" :class="pill(filters.salary)" :aria-pressed="filters.salary" @click="filters.salary = !filters.salary">
        Com salário
      </Button>
    </div>

    <div v-if="jobs.length" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <template v-for="item in feed" :key="item.kind === 'job' ? item.job.code : item.key">
        <JobCard v-if="item.kind === 'job'" :job="item.job" />
        <AdCard v-else-if="item.kind === 'ad'" :ad="item.ad" />
        <AdSenseCard v-else />
      </template>
    </div>
    <p v-else-if="failed" class="py-10 text-center text-muted-foreground">Não deu para carregar as vagas agora. Tente de novo em instantes.</p>
    <p v-else-if="!loading" class="py-10 text-center text-muted-foreground">Nenhuma vaga com esses filtros.</p>

    <div v-if="jobs.length < total" class="mt-8 flex justify-center">
      <Button variant="outline" size="lg" :disabled="loading" @click="load(false)">
        {{ loading ? "Carregando..." : "Carregar mais vagas" }}
      </Button>
    </div>
  </section>
</template>
