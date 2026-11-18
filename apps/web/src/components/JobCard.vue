<script setup lang="ts">
import { computed } from "vue";
import { ago, label, type Job } from "../api";

const props = defineProps<{ job: Job }>();

const place = computed(() => {
  const w = props.job.workplace.map(label).join(" / ");
  return [w, props.job.location].filter(Boolean).join(" · ");
});

const summary = computed(() => (props.job.description ?? "").replace(/\s+/g, " ").trim());
</script>

<template>
  <RouterLink :to="`/vagas/${job.slug}`" class="card">
    <h2 class="title">{{ job.title }}</h2>
    <p v-if="job.company" class="company">{{ job.company }}</p>
    <p v-if="place" class="place">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" />
      </svg>
      {{ place }}
    </p>
    <p v-if="summary" class="summary">{{ summary }}</p>
    <div class="chips">
      <span v-for="s in job.seniority" :key="s" class="chip">{{ label(s) }}</span>
      <span v-for="r in job.regime" :key="r" class="chip">{{ label(r) }}</span>
      <span v-if="job.salary" class="chip money">{{ job.salary }}</span>
    </div>
    <div class="foot">
      <span class="cta">Ver vaga →</span>
      <span class="when">{{ ago(job.publishedAt) }}</span>
    </div>
  </RouterLink>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-decoration: none;
  transition: border-color .15s, background .15s;
  min-width: 0;
}
.card:hover { border-color: var(--border-strong); background: var(--surface-hover); }
.title { font-size: 17px; font-weight: 600; line-height: 1.35; margin: 0; overflow-wrap: anywhere; }
.company { margin: -4px 0 0; color: var(--text); opacity: .85; font-size: 14px; }
.place { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--muted); font-size: 13.5px; }
.place svg { flex: none; }
.summary {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 13.5px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chips:empty { display: none; }
.foot { margin-top: auto; padding-top: 6px; display: flex; justify-content: space-between; align-items: center; }
.cta { color: var(--accent); font-weight: 600; font-size: 14px; }
.when { color: var(--faint); font-size: 12.5px; }
</style>
