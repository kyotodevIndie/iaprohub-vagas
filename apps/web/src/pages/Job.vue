<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { ArrowUpRight } from "@lucide/vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ago, codeFromSlug, fetchJob, label, type Job } from "@/api";

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
  <RouterLink to="/" class="mb-5 inline-block text-sm text-muted-foreground no-underline hover:text-foreground">← Todas as vagas</RouterLink>

  <p v-if="state === 'loading'" class="text-muted-foreground">Carregando...</p>

  <div v-else-if="state === 'gone'" class="space-y-3 py-10">
    <h1 class="text-2xl font-bold">Esta vaga não está mais no ar</h1>
    <p class="text-muted-foreground">As vagas ficam disponíveis por 3 semanas ou até fecharem na empresa.</p>
    <Button as-child><RouterLink to="/" class="no-underline">Ver vagas abertas</RouterLink></Button>
  </div>

  <p v-else-if="state === 'error'" class="text-muted-foreground">Não deu para carregar a vaga. Tente de novo em instantes.</p>

  <article v-else-if="job" class="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_300px]">
    <div class="min-w-0">
      <h1 class="break-words text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{{ job.title }}</h1>
      <p v-if="job.company" class="mb-4 mt-1.5 text-base text-foreground/90">
        <a v-if="job.companyWebsite" :href="job.companyWebsite" target="_blank" rel="noopener nofollow" class="text-primary no-underline hover:underline">{{ job.company }}</a>
        <template v-else>{{ job.company }}</template>
      </p>
      <div class="flex flex-wrap gap-1.5">
        <Badge v-for="w in job.workplace" :key="w" variant="secondary" class="font-medium shadow-none">{{ label(w) }}</Badge>
        <Badge v-if="job.location" variant="secondary" class="font-medium shadow-none">{{ job.location }}</Badge>
        <Badge v-for="s in job.seniority" :key="s" variant="secondary" class="font-medium shadow-none">{{ label(s) }}</Badge>
        <Badge v-for="r in job.regime" :key="r" variant="secondary" class="font-medium shadow-none">{{ label(r) }}</Badge>
        <Badge v-if="job.salary" variant="outline" class="font-medium">{{ job.salary }}</Badge>
      </div>
      <div v-if="job.stack.length" class="mt-3 flex flex-wrap gap-1.5">
        <span v-for="t in job.stack" :key="t" class="rounded-sm border border-border px-2 py-0.5 text-xs text-muted-foreground">{{ t }}</span>
      </div>
      <div v-if="job.description" class="mt-6 whitespace-pre-line break-words border-t border-border pt-5 leading-relaxed text-foreground/85">{{ job.description }}</div>
    </div>

    <Card class="order-first p-5 shadow-none md:order-none md:sticky md:top-5">
      <Button as-child size="lg" class="w-full px-4">
        <a :href="applyHref" target="_blank" rel="noopener nofollow" class="no-underline">Candidatar-se no site da empresa <ArrowUpRight /></a>
      </Button>
      <dl class="mt-5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
        <dt class="text-muted-foreground">Publicada</dt><dd class="text-right">{{ ago(job.publishedAt) }}</dd>
        <dt class="text-muted-foreground">Fica no ar até</dt><dd class="text-right">{{ expires }}</dd>
        <dt class="text-muted-foreground">Fonte</dt><dd class="text-right">{{ job.source }}</dd>
      </dl>
    </Card>
  </article>
</template>
