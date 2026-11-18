<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import JobCard from "../components/JobCard.vue";
import { fetchJobs, type Job } from "../api";

const route = useRoute();
const router = useRouter();
const one = (v: unknown) => (typeof v === "string" ? v : "");

const filters = reactive({
  q: one(route.query.q),
  workplace: one(route.query.workplace),
  seniority: one(route.query.seniority),
  salary: route.query.salary === "1",
});

const jobs = ref<Job[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const failed = ref(false);

const WORKPLACES: [string, string][] = [["", "Todos os modelos"], ["remoto", "Remoto"], ["hibrido", "Híbrido"], ["presencial", "Presencial"]];
const SENIORITIES: [string, string][] = [["estagio", "Estágio"], ["junior", "Júnior"], ["pleno", "Pleno"], ["senior", "Sênior"], ["especialista", "Especialista"], ["lideranca", "Liderança"]];

function params(p: number) {
  const s = new URLSearchParams();
  if (filters.q.trim()) s.set("q", filters.q.trim());
  if (filters.workplace) s.set("workplace", filters.workplace);
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

onMounted(() => load(true));
</script>

<template>
  <section>
    <div class="head">
      <h1>Vagas abertas</h1>
      <span v-if="total" class="muted count">{{ total }} {{ total === 1 ? "vaga" : "vagas" }}</span>
    </div>

    <div class="search">
      <label class="q field">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input v-model="filters.q" type="search" placeholder="Buscar por cargo, empresa ou stack..." aria-label="Buscar vagas" />
      </label>
      <select v-model="filters.workplace" class="field" aria-label="Modelo de trabalho">
        <option v-for="[v, l] in WORKPLACES" :key="v" :value="v">{{ l }}</option>
      </select>
    </div>

    <div class="filters">
      <button
        v-for="[v, l] in SENIORITIES"
        :key="v"
        type="button"
        class="pill"
        :class="{ on: filters.seniority === v }"
        :aria-pressed="filters.seniority === v"
        @click="toggleSeniority(v)"
      >{{ l }}</button>
      <button type="button" class="pill" :class="{ on: filters.salary }" :aria-pressed="filters.salary" @click="filters.salary = !filters.salary">
        Com salário
      </button>
    </div>

    <div v-if="jobs.length" class="grid">
      <JobCard v-for="j in jobs" :key="j.code" :job="j" />
    </div>
    <p v-else-if="failed" class="empty">Não deu para carregar as vagas agora. Tente de novo em instantes.</p>
    <p v-else-if="!loading" class="empty">Nenhuma vaga com esses filtros.</p>

    <div v-if="jobs.length < total" class="more">
      <button class="btn ghost" type="button" :disabled="loading" @click="load(false)">
        {{ loading ? "Carregando..." : "Carregar mais vagas" }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 18px; }
h1 { font-size: 26px; font-weight: 700; margin: 0; }
.count { font-size: 14px; }
.search { display: flex; gap: 12px; }
.q { flex: 1; display: flex; align-items: center; gap: 10px; color: var(--faint); min-width: 0; }
.q input { flex: 1; min-width: 0; background: none; border: 0; outline: none; color: var(--text); }
.q:focus-within { border-color: var(--accent); }
select.field { min-width: 180px; cursor: pointer; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 22px; }
.pill {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13.5px;
  cursor: pointer;
}
.pill:hover { border-color: var(--border-strong); color: var(--text); }
.pill.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 600; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.empty { color: var(--muted); padding: 40px 0; text-align: center; }
.more { display: flex; justify-content: center; margin-top: 28px; }
@media (max-width: 960px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) {
  .grid { grid-template-columns: minmax(0, 1fr); }
  .search { flex-direction: column; }
  select.field { min-width: 0; }
  h1 { font-size: 22px; }
}
</style>
