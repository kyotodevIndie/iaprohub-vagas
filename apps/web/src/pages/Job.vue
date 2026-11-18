<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { ago, codeFromSlug, fetchJob, label, type Job } from "../api";

const route = useRoute();
const job = ref<Job | null>(null);
const state = ref<"loading" | "ok" | "gone" | "error">("loading");

watch(
  () => route.params.slug as string,
  async (slug) => {
    state.value = "loading";
    try {
      job.value = await fetchJob(codeFromSlug(slug));
      state.value = "ok";
      document.title = `${job.value.title}${job.value.company ? ` · ${job.value.company}` : ""} | iaprohub vagas`;
    } catch (err) {
      state.value = (err as { status?: number }).status === 404 ? "gone" : "error";
    }
  },
  { immediate: true },
);

const applyHref = computed(() => {
  if (!job.value) return "#";
  try {
    const u = new URL(job.value.applyUrl);
    u.searchParams.set("utm_source", "iaprohub-vagas");
    return u.toString();
  } catch {
    return job.value.applyUrl;
  }
});

const expires = computed(() =>
  job.value ? new Date(job.value.expiresAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "",
);
</script>

<template>
  <RouterLink to="/" class="back muted">← Todas as vagas</RouterLink>

  <p v-if="state === 'loading'" class="muted">Carregando...</p>

  <div v-else-if="state === 'gone'" class="box">
    <h1>Esta vaga não está mais no ar</h1>
    <p class="muted">As vagas ficam disponíveis por 3 semanas ou até fecharem na empresa.</p>
    <RouterLink to="/" class="btn">Ver vagas abertas</RouterLink>
  </div>

  <p v-else-if="state === 'error'" class="muted">Não deu para carregar a vaga. Tente de novo em instantes.</p>

  <article v-else-if="job" class="layout">
    <div class="main">
      <h1>{{ job.title }}</h1>
      <p v-if="job.company" class="company">
        <a v-if="job.companyWebsite" :href="job.companyWebsite" target="_blank" rel="noopener nofollow">{{ job.company }}</a>
        <template v-else>{{ job.company }}</template>
      </p>
      <div class="chips">
        <span v-for="w in job.workplace" :key="w" class="chip">{{ label(w) }}</span>
        <span v-if="job.location" class="chip">{{ job.location }}</span>
        <span v-for="s in job.seniority" :key="s" class="chip">{{ label(s) }}</span>
        <span v-for="r in job.regime" :key="r" class="chip">{{ label(r) }}</span>
        <span v-if="job.salary" class="chip money">{{ job.salary }}</span>
      </div>
      <div v-if="job.stack.length" class="stack">
        <span v-for="t in job.stack" :key="t" class="tag">{{ t }}</span>
      </div>
      <div v-if="job.description" class="desc">{{ job.description }}</div>
    </div>

    <aside class="side">
      <a :href="applyHref" class="btn apply" target="_blank" rel="noopener nofollow">Candidatar-se no site da empresa ↗</a>
      <dl>
        <dt>Publicada</dt><dd>{{ ago(job.publishedAt) }}</dd>
        <dt>Fica no ar até</dt><dd>{{ expires }}</dd>
        <dt>Fonte</dt><dd>{{ job.source }}</dd>
      </dl>
    </aside>
  </article>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 20px; text-decoration: none; font-size: 14px; }
.back:hover { color: var(--text); }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 28px; align-items: start; }
h1 { font-size: 28px; line-height: 1.25; margin: 0 0 6px; overflow-wrap: anywhere; }
.company { margin: 0 0 14px; font-size: 16px; opacity: .9; }
.company a { color: var(--accent); text-decoration: none; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.stack { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.tag { font-size: 12.5px; padding: 2px 9px; border: 1px solid var(--border); border-radius: 6px; color: var(--muted); }
.desc {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
  white-space: pre-line;
  overflow-wrap: anywhere;
  color: #d9dbe7;
  line-height: 1.65;
}
.side {
  position: sticky;
  top: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
}
.apply { width: 100%; text-align: center; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; margin: 18px 0 0; font-size: 14px; }
dt { color: var(--faint); }
dd { margin: 0; text-align: right; }
.box { padding: 40px 0; }
.box h1 { font-size: 24px; }
.box .btn { margin-top: 16px; }
@media (max-width: 820px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .side { position: static; order: -1; }
  h1 { font-size: 23px; }
}
</style>
