<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { ArrowUpRight, SearchX, TriangleAlert } from "@lucide/vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ago, codeFromSlug, date, fetchJob, label, type Job } from "@/api";

const route = useRoute();
const job = ref<Job | null>(null);
const state = ref<"loading" | "ok" | "gone" | "error">("loading");

async function load(slug: string) {
  state.value = "loading";
  try {
    job.value = await fetchJob(codeFromSlug(slug));
    state.value = "ok";
    document.title = `${job.value.title}${job.value.company ? ` · ${job.value.company}` : ""} | IAPro Vagas`;
  } catch (err) {
    state.value = (err as { status?: number }).status === 404 ? "gone" : "error";
  }
}

watch(() => route.params.slug as string, load, { immediate: true });

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

const expires = computed(() => (job.value ? date(job.value.expiresAt, true) : ""));
</script>

<template>
  <RouterLink to="/" class="mb-6 inline-block text-sm text-muted-foreground no-underline hover:text-foreground">← Todas as vagas</RouterLink>

  <div v-if="state === 'loading'" class="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_300px]" aria-busy="true">
    <div class="flex flex-col gap-3">
      <Skeleton class="h-8 w-3/4" />
      <Skeleton class="h-5 w-1/3" />
      <Skeleton class="h-5 w-1/2" />
      <Skeleton class="mt-4 h-40 w-full" />
    </div>
    <Skeleton class="order-first h-40 rounded-xl md:order-none" />
  </div>

  <Empty v-else-if="state === 'gone'">
    <EmptyHeader>
      <EmptyMedia variant="icon"><SearchX /></EmptyMedia>
      <EmptyTitle>Esta vaga não está mais no ar</EmptyTitle>
      <EmptyDescription>As vagas ficam disponíveis por 3 semanas ou até fecharem na empresa.</EmptyDescription>
    </EmptyHeader>
    <EmptyContent><Button as-child><RouterLink to="/" class="no-underline">Ver vagas abertas</RouterLink></Button></EmptyContent>
  </Empty>

  <Empty v-else-if="state === 'error'">
    <EmptyHeader>
      <EmptyMedia variant="icon"><TriangleAlert /></EmptyMedia>
      <EmptyTitle>Não foi possível carregar a vaga</EmptyTitle>
      <EmptyDescription>Confira a sua conexão e tente de novo.</EmptyDescription>
    </EmptyHeader>
    <EmptyContent><Button variant="outline" @click="load(route.params.slug as string)">Tentar de novo</Button></EmptyContent>
  </Empty>

  <article v-else-if="job" class="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_300px]">
    <div class="min-w-0">
      <h1 class="break-words text-2xl font-semibold leading-tight tracking-tight">{{ job.title }}</h1>
      <p v-if="job.company" class="mb-4 mt-1.5 text-base text-foreground/90">
        <a v-if="job.companyWebsite" :href="job.companyWebsite" target="_blank" rel="noopener nofollow" class="text-primary no-underline hover:underline">{{ job.company }}</a>
        <template v-else>{{ job.company }}</template>
      </p>
      <div class="flex flex-wrap gap-1.5">
        <Badge v-for="w in job.workplace" :key="w" variant="secondary">{{ label(w) }}</Badge>
        <Badge v-if="job.location" variant="secondary">{{ job.location }}</Badge>
        <Badge v-for="s in job.seniority" :key="s" variant="secondary">{{ label(s) }}</Badge>
        <Badge v-for="r in job.regime" :key="r" variant="secondary">{{ label(r) }}</Badge>
        <Badge v-if="job.salary" variant="outline">{{ job.salary }}</Badge>
      </div>
      <div v-if="job.stack.length" class="mt-3 flex flex-wrap gap-1.5">
        <Badge v-for="t in job.stack" :key="t" variant="outline" class="rounded-sm font-normal text-muted-foreground">{{ t }}</Badge>
      </div>
      <div v-if="job.description" class="mt-6 whitespace-pre-line break-words border-t border-border pt-6 text-sm leading-relaxed text-foreground/85 sm:text-base">{{ job.description }}</div>
    </div>

    <Card class="order-first gap-0 p-6 shadow-none md:order-none md:sticky md:top-6">
      <Button as-child size="lg" class="w-full px-4">
        <a :href="applyHref" target="_blank" rel="noopener nofollow" class="no-underline">Candidatar-se no site da empresa <ArrowUpRight /></a>
      </Button>
      <dl class="mt-6 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
        <dt class="text-muted-foreground">Publicada</dt><dd class="text-right" :title="date(job.publishedAt)">{{ ago(job.publishedAt) }}</dd>
        <dt class="text-muted-foreground">Fica no ar até</dt><dd class="text-right tabular-nums">{{ expires }}</dd>
        <dt class="text-muted-foreground">Fonte</dt><dd class="text-right">{{ job.source }}</dd>
      </dl>
    </Card>
  </article>
</template>
